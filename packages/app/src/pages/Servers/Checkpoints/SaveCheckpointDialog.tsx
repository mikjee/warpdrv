import { useState, useMemo } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button, Input, Spinner } from '@chakra-ui/react';
import { Save } from 'lucide-react';
import { useStore } from '@/store';
import { saveCheckpoint, fetchCheckpoints, deleteCheckpoint } from '@/api/services';
import { useToast } from '@/components/ToastProvider';
import type { IServer, ICheckpoint, ISlotLiveState, ISlotLiveMetadata, TSlotId } from '@warpcore/shared';
import { ECheckpointSaveMode } from '@warpcore/shared';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';

type TSaveTab = 'REPLACE_LATEST' | 'NEW';
type TSlotMode = 'ALL' | 'LATEST' | 'LARGEST' | 'SLOT';

interface ISaveCheckpointDialogProps {
	server: IServer;
	isOpen: boolean;
	onClose: () => void;
}

export function SaveCheckpointDialog({ server, isOpen, onClose }: ISaveCheckpointDialogProps) {
	const { toast } = useToast();
	const serverSlots = useStore((s) => s.serverSlots[server.id] ?? null);
	const checkpoints = useStore((s) => s.checkpoints);

	const slots: ISlotLiveState[] = serverSlots?.slots ?? [];
	const metadata: Record<TSlotId, ISlotLiveMetadata> = serverSlots?.metadata ?? {};

	const latestForServer = useMemo<ICheckpoint | null>(() => {
		const forServer = Object.values(checkpoints).filter(c => c.serverId === server.id);
		if (forServer.length === 0) return null;
		return forServer.sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
	}, [checkpoints, server.id]);

	const [tab, setTab] = useState<TSaveTab>(latestForServer ? 'REPLACE_LATEST' : 'NEW');
	const [name, setName] = useState<string>('');
	const [slotMode, setSlotMode] = useState<TSlotMode>('ALL');
	const [selectedSlot, setSelectedSlot] = useState<TSlotId>(slots[0]?.slotId ?? 0);
	const [isSaving, setIsSaving] = useState<boolean>(false);
	const [confirmReplace, setConfirmReplace] = useState<boolean>(false);

	const targetSlotIds = useMemo<TSlotId[] | null>(() => {
		if (slots.length === 0) return null;
		if (slotMode === 'ALL') return null;
		if (slotMode === 'LATEST') {
			const latest = [...slots].sort((a, b) => b.lastActivityAt - a.lastActivityAt)[0];
			return latest ? [latest.slotId] : null;
		}
		if (slotMode === 'LARGEST') {
			const largest = [...slots].sort((a, b) => b.cachedTokens - a.cachedTokens)[0];
			return largest ? [largest.slotId] : null;
		}
		return [selectedSlot];
	}, [slotMode, slots, selectedSlot]);

	const previewSlot = useMemo<ISlotLiveState | null>(() => {
		if (slotMode !== 'SLOT') return null;
		return slots.find(s => s.slotId === selectedSlot) ?? null;
	}, [slotMode, slots, selectedSlot]);

	const previewMeta = previewSlot ? metadata[previewSlot.slotId] ?? null : null;

	async function performSave() {
		setIsSaving(true);
		try {
			if (tab === 'REPLACE_LATEST' && latestForServer) {
				const bundleId = latestForServer.bundleId;
				const toDelete = bundleId
					? Object.values(checkpoints).filter(c => c.bundleId === bundleId)
					: [latestForServer];
				for (const cp of toDelete) {
					await deleteCheckpoint(cp.id);
				}
			}
			const res = await saveCheckpoint({
				serverId: server.id,
				slotIds: targetSlotIds,
				mode: ECheckpointSaveMode.SAVE,
				name: tab === 'NEW' && name.trim().length > 0 ? name.trim() : null,
				notes: null,
			});
			if (res.ok) {
				toast('success', `Saved ${res.data?.checkpoints.length ?? 0} checkpoint(s)`);
				await fetchCheckpoints(server.id);
				onClose();
			} else {
				toast('error', res.error ?? 'Save failed');
			}
		} catch (err) {
			toast('error', String(err));
		} finally {
			setIsSaving(false);
		}
	}

	function handleSaveClick() {
		if (tab === 'REPLACE_LATEST') {
			setConfirmReplace(true);
			return;
		}
		performSave();
	}

	const tabButtonStyle = (active: boolean) => ({
		flex: '1',
		size: 'sm' as const,
		bg: active ? 'var(--wc-accent-blue-bg-8)' : 'var(--wc-bg-subtle)',
		color: active ? 'var(--wc-accent-blue)' : 'var(--wc-text-secondary)',
		borderWidth: '1px',
		borderColor: active ? 'var(--wc-accent-blue-border)' : 'var(--wc-border-subtle)',
		_hover: { bg: active ? 'var(--wc-accent-blue-hover-bg)' : 'var(--wc-bg-hover)' },
		borderRadius: 'lg',
		fontSize: '12px',
		fontWeight: '500',
	});

	return (
		<>
			<Dialog.Root open={isOpen} onOpenChange={(d) => { if (!d.open) onClose(); }}>
				<Portal>
					<Box position="fixed" inset="6px" borderRadius="12px" overflow="hidden" zIndex="modal">
						<Dialog.Backdrop position="absolute" />
						<Dialog.Positioner position="absolute">
							<Dialog.Content
								maxW="480px"
								bg="var(--wc-bg-dialog)"
								borderColor="var(--wc-border-default)"
								borderRadius="2xl"
								shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
							>
							<Box position="relative">
								<VStack gap="4" px="6" py="5" align="stretch" style={{ opacity: isSaving ? 0.5 : 1 }}>
								<HStack gap="2">
									<Box w="8" h="8" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="var(--wc-accent-blue-bg-8)">
										<Save size={16} color="var(--wc-accent-blue)" />
									</Box>
									<Dialog.Title fontSize="15px" fontWeight="700" color="var(--wc-text-primary)">
										Save Checkpoint
									</Dialog.Title>
								</HStack>

								<HStack gap="2">
									<Button
										{...tabButtonStyle(tab === 'REPLACE_LATEST')}
										onClick={() => setTab('REPLACE_LATEST')}
										disabled={latestForServer === null}
									>
										Replace latest
									</Button>
									<Button
										{...tabButtonStyle(tab === 'NEW')}
										onClick={() => setTab('NEW')}
									>
										New
									</Button>
								</HStack>

								{tab === 'REPLACE_LATEST' && latestForServer && (
									<Box px="3" py="2.5" borderRadius="lg" bg="var(--wc-bg-subtle)" borderWidth="1px" borderColor="var(--wc-border-default)">
										<Text fontSize="11px" color="var(--wc-text-tertiary)">Overwriting</Text>
										<Text fontSize="13px" color="var(--wc-text-primary)" mt="0.5">{latestForServer.name}</Text>
										<Text fontSize="11px" color="var(--wc-text-tertiary)" mt="0.5">
											{new Date(latestForServer.createdAt).toLocaleString()}
										</Text>
									</Box>
								)}

								{tab === 'NEW' && (
									<VStack gap="1.5" align="stretch">
										<Text fontSize="11px" color="var(--wc-text-tertiary)">Name</Text>
										<Input
											size="sm"
											value={name}
											onChange={(e) => setName(e.target.value)}
											placeholder="Checkpoint name"
											bg="var(--wc-bg-subtle)"
											borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)"
											fontSize="13px"
										/>
									</VStack>
								)}

								<VStack gap="1.5" align="stretch" style={{ display: "none" }}>
									<Text fontSize="11px" color="var(--wc-text-tertiary)">Select slots</Text>
									<HStack gap="2">
										<Button {...tabButtonStyle(slotMode === 'ALL')} onClick={() => setSlotMode('ALL')}>All</Button>
										<Button {...tabButtonStyle(slotMode === 'LATEST')} onClick={() => setSlotMode('LATEST')}>Latest</Button>
										<Button {...tabButtonStyle(slotMode === 'LARGEST')} onClick={() => setSlotMode('LARGEST')}>Largest</Button>
										<Button {...tabButtonStyle(slotMode === 'SLOT')} onClick={() => setSlotMode('SLOT')}>Slot</Button>
									</HStack>
								</VStack>

								{slotMode === 'SLOT' && (
									<HStack gap="2" flexWrap="wrap">
										{slots.map(s => (
											<Button
												key={s.slotId}
												{...tabButtonStyle(selectedSlot === s.slotId)}
												onClick={() => setSelectedSlot(s.slotId)}
												flex="none"
												minW="48px"
											>
												{s.slotId}
											</Button>
										))}
									</HStack>
								)}

								{previewSlot && (
									<Box px="3" py="2.5" borderRadius="lg" bg="var(--wc-bg-subtle)" borderWidth="1px" borderColor="var(--wc-border-default)">
										<HStack justify="space-between">
											<Text fontSize="11px" color="var(--wc-text-tertiary)">Context</Text>
											<Text fontSize="12px" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace'>
												{previewSlot.cachedTokens.toLocaleString()} / {previewSlot.nCtx.toLocaleString()}
											</Text>
										</HStack>
										{previewMeta && (
											<>
												<HStack justify="space-between" mt="1">
													<Text fontSize="11px" color="var(--wc-text-tertiary)">Messages</Text>
													<Text fontSize="12px" color="var(--wc-text-primary)">{previewMeta.messageCount}</Text>
												</HStack>
												{previewMeta.lastUserMessagePreview && (
													<Box mt="2">
														<Text fontSize="11px" color="var(--wc-text-tertiary)">Last message</Text>
														<Text fontSize="12px" color="var(--wc-text-secondary)" mt="0.5" lineHeight="1.4">
															{previewMeta.lastUserMessagePreview}
														</Text>
													</Box>
												)}
											</>
										)}
									</Box>
								)}

								<HStack gap="2" w="100%" pt="2">
									<Button
										flex="1"
										size="sm"
										variant="ghost"
color="var(--wc-text-tertiary)"
									_hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-hover)' }}
										borderRadius="lg"
										fontSize="13px"
										onClick={onClose}
										disabled={isSaving}
									>
										Cancel
									</Button>
									<Button
										flex="1"
										size="sm"
bg="var(--wc-accent-blue-bg-12)"
									color="var(--wc-accent-blue)"
									borderWidth="1px"
									borderColor="var(--wc-accent-blue-border)"
									_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={handleSaveClick}
										disabled={isSaving || slots.length === 0}
									>
										{isSaving ? 'Saving...' : 'Save'}
									</Button>
								</HStack>
							</VStack>

							{isSaving && (
								<Box
									position="absolute"
									top="0"
									left="0"
									right="0"
									bottom="0"
bg="rgba(0,0,0,0.3)"
								display="flex"
								alignItems="center"
								justifyContent="center"
								borderRadius="2xl"
								zIndex={1}
							>
								<Spinner size="md" color="var(--wc-accent-blue)" />
								</Box>
							)}
						</Box>
						</Dialog.Content>
						</Dialog.Positioner>
					</Box>
				</Portal>
			</Dialog.Root>

			{confirmReplace && latestForServer && (
				<ConfirmDialog
					isOpen={confirmReplace}
					title="Replace existing checkpoint?"
					message={`This will overwrite "${latestForServer.name}". This action cannot be undone.`}
					confirmLabel="Replace"
					loadingLabel="Replacing..."
					isLoading={isSaving}
					onConfirm={() => { setConfirmReplace(false); performSave(); }}
					onCancel={() => setConfirmReplace(false)}
				/>
			)}
		</>
	);
}
