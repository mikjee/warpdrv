import { useState, useMemo } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button, Spinner } from '@chakra-ui/react';
import { Upload } from 'lucide-react';
import { useStore } from '@/store';
import { restoreCheckpointsMapped, restartServer } from '@/api/services';
import { useToast } from '@/components/ToastProvider';
import type { IServer, ICheckpoint, ICheckpointSlotMapping, TCheckpointId, TSlotId } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';

type TFilter = 'THIS_SERVER' | 'ALL_COMPATIBLE';

interface ILoadCheckpointDialogProps {
	server: IServer;
	isOpen: boolean;
	onClose: () => void;
}

function formatBytes(n: number): string {
	if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
	if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`;
	if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
	return `${n} B`;
}

function formatAge(createdAt: number): string {
	const ms = Date.now() - createdAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

export function LoadCheckpointDialog({ server, isOpen, onClose }: ILoadCheckpointDialogProps) {
	const { toast } = useToast();
	const allCheckpoints = useStore((s) => s.checkpoints);
	const serverSlots = useStore((s) => s.serverSlots[server.id] ?? null);

	const [filter, setFilter] = useState<TFilter>('THIS_SERVER');
	const [selected, setSelected] = useState<Record<TCheckpointId, TSlotId>>({});
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isLaunching, setIsLaunching] = useState<boolean>(false);
	const [confirmOpen, setConfirmOpen] = useState<boolean>(false);

	const isServerRunning = server.status === EServerStatus.RUNNING;

	const targetSlotIds = useMemo<TSlotId[]>(() => {
		if (serverSlots?.slots && serverSlots.slots.length > 0) {
			return serverSlots.slots.map(s => s.slotId).sort((a, b) => a - b);
		}
		const slotCount = server.params.parallelSlots || 4;
		return Array.from({ length: slotCount }, (_, i) => i as TSlotId);
	}, [serverSlots, server.params.parallelSlots]);

	const filtered = useMemo<ICheckpoint[]>(() => {
		const list = Object.values(allCheckpoints);
		if (filter === 'THIS_SERVER') {
			return list.filter(c => c.serverId === server.id);
		}
		const ownFp = list.find(c => c.serverId === server.id)?.fingerprintHash;
		if (ownFp) return list.filter(c => c.fingerprintHash === ownFp);
		return list;
	}, [allCheckpoints, filter, server.id]);

	const bundles = useMemo(() => {
		const byBundle: Record<string, ICheckpoint[]> = {};
		const standalone: ICheckpoint[] = [];
		for (const cp of filtered) {
			if (cp.bundleId == null) {
				standalone.push(cp);
			} else {
				if (!byBundle[cp.bundleId]) byBundle[cp.bundleId] = [];
				byBundle[cp.bundleId]!.push(cp);
			}
		}
		const bundleGroups = Object.entries(byBundle).map(([bundleId, items]) => ({
			bundleId,
			items: items.sort((a, b) => a.slotIndex - b.slotIndex),
		}));
		bundleGroups.sort((a, b) => (b.items[0]?.createdAt ?? 0) - (a.items[0]?.createdAt ?? 0));
		return { bundleGroups, standalone: standalone.sort((a, b) => b.createdAt - a.createdAt) };
	}, [filtered]);

	function autoAssignTarget(currentSelection: Record<TCheckpointId, TSlotId>): TSlotId {
		const used = new Set(Object.values(currentSelection));
		for (const t of targetSlotIds) {
			if (!used.has(t)) return t;
		}
		return targetSlotIds[0] ?? 0;
	}

	function toggleCheckpoint(cp: ICheckpoint) {
		setSelected(prev => {
			const next = { ...prev };
			if (cp.id in next) {
				delete next[cp.id];
			} else {
				next[cp.id] = autoAssignTarget(next);
			}
			return next;
		});
	}

	function toggleBundle(items: ICheckpoint[]) {
		const allSelected = items.every(cp => cp.id in selected);
		setSelected(prev => {
			const next = { ...prev };
			if (allSelected) {
				for (const cp of items) delete next[cp.id];
			} else {
				for (const cp of items) {
					if (!(cp.id in next)) next[cp.id] = autoAssignTarget(next);
				}
			}
			return next;
		});
	}

	function setTargetSlot(cpId: TCheckpointId, targetSlot: TSlotId) {
		setSelected(prev => ({ ...prev, [cpId]: targetSlot }));
	}

	const mappings: ICheckpointSlotMapping[] = useMemo(() => {
		return Object.entries(selected).map(([checkpointId, targetSlotId]) => ({ checkpointId, targetSlotId }));
	}, [selected]);

	const hasDuplicateTargets = useMemo(() => {
		const targets = mappings.map(m => m.targetSlotId);
		return targets.length !== new Set(targets).size;
	}, [mappings]);

	const canLoad = mappings.length > 0 && !hasDuplicateTargets && targetSlotIds.length > 0;

	async function performLoad() {
		if (!isServerRunning) {
			setIsLaunching(true);
			try {
				const startRes = await restartServer(server.id);
				if (!startRes.ok) {
					toast('error', startRes.error ?? 'Failed to start server');
					setIsLaunching(false);
					return;
				}
				await new Promise<void>((resolve, reject) => {
					const unsubscribe = useStore.subscribe((state) => {
						if (state.servers[server.id]?.status === EServerStatus.RUNNING) {
							unsubscribe();
							resolve();
						}
						if (state.servers[server.id]?.status === EServerStatus.ERROR) {
							unsubscribe();
							reject(new Error('Server failed to start'));
						}
					});
					setTimeout(() => {
						unsubscribe();
						reject(new Error('Server took too long to start'));
					}, 15000);
				});
			} catch (err) {
				toast('error', String(err));
				setIsLaunching(false);
				return;
			} finally {
				setIsLaunching(false);
			}
		}

		setIsLoading(true);
		try {
			const res = await restoreCheckpointsMapped({
				targetServerId: server.id,
				mappings,
			});
			if (res.ok && res.data?.success) {
				toast('success', `Loaded ${res.data.restoredSlotCount} slot(s)`);
				onClose();
			} else if (res.data?.fingerprintMismatches.length) {
				toast('error', 'Checkpoint incompatible with target server');
			} else {
				toast('error', res.error ?? 'Load failed');
			}
		} catch (err) {
			toast('error', String(err));
		} finally {
			setIsLoading(false);
		}
	}

	const filterButtonStyle = (active: boolean) => ({
		flex: '1',
		size: 'sm' as const,
		bg: active ? 'var(--w-servers-checkpoint-tab-activebg)' : 'var(--w-servers-checkpoint-tab-inactivebg)',
		color: active ? 'var(--w-servers-checkpoint-tab-activecolor)' : 'var(--w-servers-checkpoint-tab-inactivecolor)',
		borderWidth: '1px',
		borderColor: active ? 'var(--w-servers-checkpoint-tab-activeborder)' : 'var(--w-servers-checkpoint-tab-inactiveborder)',
		_hover: { bg: active ? 'var(--w-servers-checkpoint-tab-activehover)' : 'var(--w-servers-checkpoint-tab-inactivehover)' },
		borderRadius: 'lg',
		fontSize: '12px',
		fontWeight: '500',
	});

	function CheckpointRow({ cp, indent }: { cp: ICheckpoint; indent: boolean }) {
		const isSelected = cp.id in selected;
		const target = selected[cp.id];
		return (
			<HStack
				gap="2"
				px="2"
				py="1.5"
				borderRadius="md"
				bg={isSelected ? 'var(--w-servers-checkpoint-row-selectedbg)' : 'transparent'}
				_hover={{ bg: isSelected ? 'var(--w-servers-checkpoint-row-selectedhover)' : 'var(--w-servers-checkpoint-row-inactivehover)' }}
				pl={indent ? '6' : '2'}
				cursor="pointer"
				onClick={() => toggleCheckpoint(cp)}
			>
				<Box
					w="14px"
					h="14px"
					borderRadius="sm"
					borderWidth="1px"
					borderColor={isSelected ? 'var(--w-servers-checkpoint-checkbox-active)' : 'var(--w-servers-checkpoint-checkbox-inactive)'}
					bg={isSelected ? 'var(--w-servers-checkpoint-checkbox-active)' : 'transparent'}
					flexShrink="0"
				/>
				<VStack gap="0" align="stretch" flex="1">
					<HStack gap="2">
						<Text fontSize="12px" color="var(--w-servers-checkpoint-row-text)" fontFamily='"Geist Mono", monospace'>
							Slot {cp.slotIndex}
						</Text>
						<Text fontSize="11px" color="var(--w-servers-checkpoint-row-tokens)" fontFamily='"Geist Mono", monospace'>
							{cp.tokens.toLocaleString()} tok
						</Text>
					</HStack>
				</VStack>
				{isSelected && (
					<HStack gap="1" onClick={(e) => e.stopPropagation()}>
						<Text fontSize="11px" color="var(--w-servers-checkpoint-row-arrow)">→</Text>
						<select
							value={target}
							onChange={(e) => setTargetSlot(cp.id, parseInt(e.target.value, 10))}
							style={{
								background: 'var(--w-servers-checkpoint-select-bg)',
								border: '1px solid var(--w-servers-checkpoint-select-border)',
								borderRadius: '4px',
								color: 'var(--w-servers-checkpoint-select-color)',
								fontSize: '11px',
								fontFamily: '"Geist Mono", monospace',
								padding: '2px 4px',
							}}
						>
							{targetSlotIds.map(t => (
								<option key={t} value={t}>{t}</option>
							))}
						</select>
					</HStack>
				)}
			</HStack>
		);
	}

	function BundleHeader({ bundleId, items }: { bundleId: string; items: ICheckpoint[] }) {
		const allSelected = items.every(cp => cp.id in selected);
		const someSelected = !allSelected && items.some(cp => cp.id in selected);
		const first = items[0]!;
		const totalSize = items.reduce((sum, i) => sum + i.sizeBytes, 0);
		return (
			<HStack
				gap="2"
				px="2"
				py="1.5"
				borderRadius="md"
				bg="var(--w-servers-checkpoint-bundle-bg)"
				cursor="pointer"
				onClick={() => toggleBundle(items)}
				_hover={{ bg: 'var(--w-servers-checkpoint-bundle-hover)' }}
			>
				<Box
					w="14px"
					h="14px"
					borderRadius="sm"
					borderWidth="1px"
					borderColor={allSelected ? 'var(--w-servers-checkpoint-checkbox-active)' : someSelected ? 'var(--w-servers-checkpoint-bundle-partial-border)' : 'var(--w-servers-checkpoint-checkbox-inactive)'}
					bg={allSelected ? 'var(--w-servers-checkpoint-checkbox-active)' : someSelected ? 'var(--w-servers-checkpoint-bundle-partial-bg)' : 'transparent'}
					flexShrink="0"
				/>
				<VStack gap="0" align="stretch" flex="1">
					<Text fontSize="12px" color="var(--w-servers-checkpoint-bundle-text)" fontWeight="500">{first.name}</Text>
					<Text fontSize="10px" color="var(--w-servers-checkpoint-bundle-meta)" fontFamily='"Geist Mono", monospace'>
						{items.length} slots · {formatBytes(totalSize)} · {formatAge(first.createdAt)}
					</Text>
				</VStack>
			</HStack>
		);
	}

	return (
		<>
			<Dialog.Root open={isOpen} onOpenChange={(d) => { if (!d.open) onClose(); }}>
				<Portal>
					<Box position="fixed" inset="6px" borderRadius="12px" overflow="hidden" zIndex="modal">
						<Dialog.Backdrop position="absolute" />
						<Dialog.Positioner position="absolute">
							<Dialog.Content
								maxW="520px"
								bg="var(--w-servers-launch-dialog-bg)"
								borderColor="var(--w-servers-launch-dialog-border)"
								borderRadius="2xl"
								shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
							>
							<Box position="relative">
								<VStack gap="4" px="6" py="5" align="stretch" style={{ opacity: (isLaunching || isLoading) ? 0.5 : 1 }}>
								<HStack gap="2">
									<Box w="8" h="8" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="var(--w-servers-checkpoint-icon-bg)">
										<Upload size={16} color="var(--w-servers-checkpoint-icon-color)" />
									</Box>
									<Dialog.Title fontSize="15px" fontWeight="700" color="var(--w-servers-checkpoint-title)">
										Load Checkpoint
									</Dialog.Title>
								</HStack>

								<HStack gap="2">
									<Button {...filterButtonStyle(filter === 'THIS_SERVER')} onClick={() => setFilter('THIS_SERVER')}>
										This server
									</Button>
									<Button {...filterButtonStyle(filter === 'ALL_COMPATIBLE')} onClick={() => setFilter('ALL_COMPATIBLE')}>
										All compatible
									</Button>
								</HStack>

								<VStack
									gap="1"
									align="stretch"
									maxH="320px"
									overflowY="auto"
									borderRadius="lg"
									bg="var(--w-servers-checkpoint-list-bg)"
									borderWidth="1px"
									borderColor="var(--w-servers-checkpoint-list-border)"
									p="2"
								>
									{bundles.bundleGroups.length === 0 && bundles.standalone.length === 0 && (
										<Text fontSize="12px" color="var(--w-servers-checkpoint-list-empty)" textAlign="center" py="4">
											No checkpoints available
										</Text>
									)}
									{bundles.bundleGroups.map(({ bundleId, items }) => (
										<VStack key={bundleId} gap="0" align="stretch">
											<BundleHeader bundleId={bundleId} items={items} />
											{items.map(cp => (
												<CheckpointRow key={cp.id} cp={cp} indent={true} />
											))}
										</VStack>
									))}
									{bundles.standalone.map(cp => (
										<CheckpointRow key={cp.id} cp={cp} indent={false} />
									))}
								</VStack>

								<HStack justify="space-between">
									<Text fontSize="11px" color={hasDuplicateTargets ? 'var(--w-servers-checkpoint-status-error)' : 'var(--w-servers-checkpoint-status-ok)'}>
										{hasDuplicateTargets
											? 'Duplicate target slots - adjust assignments'
											: `Loading ${mappings.length} slot(s) into target server`}
									</Text>
								</HStack>

								<HStack gap="2" w="100%" pt="2">
									<Button
										flex="1"
										size="sm"
										variant="ghost"
										color="var(--w-servers-launch-cancel-btn)"
										_hover={{ color: 'var(--w-servers-launch-cancel-hover)', bg: 'var(--w-servers-launch-cancel-hoverbg)' }}
										borderRadius="lg"
										fontSize="13px"
										onClick={onClose}
										disabled={isLoading}
									>
										Cancel
									</Button>
									<Button
										flex="1"
										size="sm"
										bg="var(--w-servers-launch-confirm-bg)"
										color="var(--w-servers-launch-confirm-color)"
										borderWidth="1px"
										borderColor="var(--w-servers-launch-confirm-border)"
										_hover={{ bg: 'var(--w-servers-launch-confirm-hover)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={() => setConfirmOpen(true)}
										disabled={isLoading || isLaunching || !canLoad}
									>
										{isLaunching ? 'Launching...' : isLoading ? 'Loading...' : isServerRunning ? 'Load' : 'Launch'}
									</Button>
								</HStack>
							</VStack>

							{(isLaunching || isLoading) && (
								<Box
									position="absolute"
									top="0"
									left="0"
									right="0"
									bottom="0"
									bg="var(--w-servers-checkpoint-overlay)"
									display="flex"
									alignItems="center"
									justifyContent="center"
									borderRadius="2xl"
									zIndex={1}
								>
									<Spinner size="md" color="var(--w-servers-checkpoint-spinner)" />
								</Box>
							)}
						</Box>
						</Dialog.Content>
						</Dialog.Positioner>
					</Box>
				</Portal>
			</Dialog.Root>

			{confirmOpen && (
				<ConfirmDialog
					isOpen={confirmOpen}
					title="Overwrite target slots?"
					message="Loading will replace the current KV cache in the selected target slots."
					confirmLabel="Load"
					loadingLabel="Loading..."
					isLoading={isLoading}
					onConfirm={() => { setConfirmOpen(false); performLoad(); }}
					onCancel={() => setConfirmOpen(false)}
				/>
			)}
		</>
	);
}
