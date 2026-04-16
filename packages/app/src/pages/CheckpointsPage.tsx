import { Box, Text, HStack, VStack, Flex, Input, Button } from '@chakra-ui/react';
import { Database, Trash2, Edit, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useState, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';

import { useStore } from '../store';
import { deleteCheckpoint, updateCheckpoint } from '../api/services';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { useToast } from '../components/ToastProvider';
import type { ICheckpoint, TCheckpointId } from '@warpcore/shared';

type TSortOrder = 'NEWEST' | 'OLDEST' | 'LARGEST' | 'NAME';

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

export function CheckpointsPage() {
	const { toast } = useToast();
	const checkpointsRecord = useStore((s) => s.checkpoints);

	const [search, setSearch] = useState<string>('');
	const [sortOrder, setSortOrder] = useState<TSortOrder>('NEWEST');
	const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>({});
	const [deletingCheckpointId, setDeletingCheckpointId] = useState<TCheckpointId | null>(null);
	const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);
	const [renamingId, setRenamingId] = useState<TCheckpointId | null>(null);
	const [renameValue, setRenameValue] = useState<string>('');

	const all: ICheckpoint[] = useMemo(() => Object.values(checkpointsRecord), [checkpointsRecord]);

	const filtered = useMemo(() => {
		const term = search.trim().toLowerCase();
		if (term.length === 0) return all;
		return all.filter(c => c.name.toLowerCase().includes(term) || c.fingerprint.modelFilename.toLowerCase().includes(term));
	}, [all, search]);

	const grouped = useMemo(() => {
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
		const bundles = Object.entries(byBundle).map(([bundleId, items]) => ({
			bundleId,
			items: items.sort((a, b) => a.slotIndex - b.slotIndex),
			createdAt: Math.max(...items.map(i => i.createdAt)),
			totalSize: items.reduce((s, i) => s + i.sizeBytes, 0),
			totalTokens: items.reduce((s, i) => s + i.tokens, 0),
			name: items[0]?.name ?? bundleId,
		}));

		const sortFn = (aCreatedAt: number, bCreatedAt: number, aSize: number, bSize: number, aName: string, bName: string) => {
			if (sortOrder === 'NEWEST') return bCreatedAt - aCreatedAt;
			if (sortOrder === 'OLDEST') return aCreatedAt - bCreatedAt;
			if (sortOrder === 'LARGEST') return bSize - aSize;
			return aName.localeCompare(bName);
		};

		bundles.sort((a, b) => sortFn(a.createdAt, b.createdAt, a.totalSize, b.totalSize, a.name, b.name));
		standalone.sort((a, b) => sortFn(a.createdAt, b.createdAt, a.sizeBytes, b.sizeBytes, a.name, b.name));

		return { bundles, standalone };
	}, [filtered, sortOrder]);

	const totalDiskUsage = useMemo(() => {
		return all.reduce((s, c) => s + c.sizeBytes, 0);
	}, [all]);

	function toggleBundle(bundleId: string) {
		setExpandedBundles(prev => ({ ...prev, [bundleId]: !prev[bundleId] }));
	}

	async function handleDeleteOne(id: TCheckpointId) {
		const res = await deleteCheckpoint(id);
		if (res.ok) {
			toast('success', 'Checkpoint deleted');
		} else {
			toast('error', res.error ?? 'Delete failed');
		}
		setDeletingCheckpointId(null);
	}

	async function handleDeleteBundle(bundleId: string) {
		const items = all.filter(c => c.bundleId === bundleId);
		for (const cp of items) {
			await deleteCheckpoint(cp.id);
		}
		toast('success', `Deleted ${items.length} checkpoint(s)`);
		setDeletingBundleId(null);
	}

	function startRename(cp: ICheckpoint) {
		setRenamingId(cp.id);
		setRenameValue(cp.name);
	}

	async function commitRename() {
		if (renamingId == null) return;
		const res = await updateCheckpoint(renamingId, { name: renameValue });
		if (res.ok) {
			toast('success', 'Renamed');
		} else {
			toast('error', res.error ?? 'Rename failed');
		}
		setRenamingId(null);
		setRenameValue('');
	}

	const sortButtonStyle = (active: boolean) => ({
		size: 'xs' as const,
		bg: active ? 'rgba(51, 129, 255, 0.12)' : 'transparent',
		color: active ? '#3381ff' : 'rgba(255, 255, 255, 0.5)',
		borderWidth: '1px',
		borderColor: active ? 'rgba(51, 129, 255, 0.25)' : 'rgba(255, 255, 255, 0.08)',
		_hover: { bg: active ? 'rgba(51, 129, 255, 0.18)' : 'rgba(255, 255, 255, 0.04)' },
		borderRadius: 'md',
		fontSize: '11px',
		fontWeight: '500',
	});

	function CheckpointActions({ cp }: { cp: ICheckpoint }) {
		return (
			<HStack gap="0.5">
				<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => startRename(cp)}>
					<Edit size={12} />
				</Button>
				<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => setDeletingCheckpointId(cp.id)}>
					<Trash2 size={12} />
				</Button>
			</HStack>
		);
	}

	function CheckpointRow({ cp, indent }: { cp: ICheckpoint; indent: boolean }) {
		const isRenaming = renamingId === cp.id;
		return (
			<HStack
				gap="2"
				px="3"
				py="2"
				pl={indent ? '10' : '3'}
				borderRadius="md"
				_hover={{ bg: 'rgba(255, 255, 255, 0.03)' }}
			>
				<VStack gap="0" align="stretch" flex="1">
					<HStack gap="2">
						{isRenaming ? (
							<Input
								size="xs"
								value={renameValue}
								onChange={(e) => setRenameValue(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter') commitRename();
									if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
								}}
								onBlur={commitRename}
								autoFocus
								bg="rgba(255, 255, 255, 0.03)"
								borderColor="rgba(51, 129, 255, 0.3)"
								color="#e4e4e7"
								fontSize="12px"
							/>
						) : (
							<Text fontSize="12px" color="#e4e4e7" fontFamily='"Geist Mono", monospace'>
								Slot {cp.slotIndex}
							</Text>
						)}
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
							{cp.tokens.toLocaleString()} tok
						</Text>
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
							{formatBytes(cp.sizeBytes)}
						</Text>
					</HStack>
					<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>
						{cp.fingerprint.modelFilename}
					</Text>
				</VStack>
				<CheckpointActions cp={cp} />
			</HStack>
		);
	}

	const deletingCheckpoint = deletingCheckpointId ? checkpointsRecord[deletingCheckpointId] ?? null : null;
	const deletingBundleItems = deletingBundleId ? all.filter(c => c.bundleId === deletingBundleId) : [];

	return (
		<Box>
			<PageHeader
				title="Checkpoints"
				subtitle="Saved KV cache states"
				icon={<Database size={20} />}
			/>
			<Box p="4">
				<HStack gap="3" mb="4">
					<HStack gap="2" flex="1" px="3" py="2" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)">
						<Search size={14} color="rgba(255, 255, 255, 0.4)" />
						<Input
							size="xs"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Search checkpoints..."
							bg="transparent"
							border="none"
							color="#e4e4e7"
							fontSize="13px"
							_placeholder={{ color: 'rgba(255, 255, 255, 0.3)' }}
							px="0"
						/>
					</HStack>
					<HStack gap="1">
						<Button {...sortButtonStyle(sortOrder === 'NEWEST')} onClick={() => setSortOrder('NEWEST')}>Newest</Button>
						<Button {...sortButtonStyle(sortOrder === 'OLDEST')} onClick={() => setSortOrder('OLDEST')}>Oldest</Button>
						<Button {...sortButtonStyle(sortOrder === 'LARGEST')} onClick={() => setSortOrder('LARGEST')}>Largest</Button>
						<Button {...sortButtonStyle(sortOrder === 'NAME')} onClick={() => setSortOrder('NAME')}>Name</Button>
					</HStack>
				</HStack>

				<VStack
					gap="1"
					align="stretch"
					borderRadius="lg"
					bg="rgba(255, 255, 255, 0.02)"
					borderWidth="1px"
					borderColor="rgba(255, 255, 255, 0.05)"
					p="2"
					minH="240px"
				>
					{grouped.bundles.length === 0 && grouped.standalone.length === 0 && (
						<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" textAlign="center" py="8">
							No checkpoints yet
						</Text>
					)}

					{grouped.bundles.map(b => {
						const expanded = expandedBundles[b.bundleId] ?? true;
						return (
							<VStack key={b.bundleId} gap="0" align="stretch">
								<HStack
									gap="2"
									px="3"
									py="2"
									borderRadius="md"
									bg="rgba(255, 255, 255, 0.02)"
									_hover={{ bg: 'rgba(255, 255, 255, 0.04)' }}
								>
									<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.5)" _hover={{ color: '#e4e4e7' }} borderRadius="md" onClick={() => toggleBundle(b.bundleId)}>
										{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
									</Button>
									<VStack gap="0" align="stretch" flex="1">
										<Text fontSize="13px" color="#e4e4e7" fontWeight="500">{b.name}</Text>
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
											{b.items.length} slots · {formatBytes(b.totalSize)} · {b.totalTokens.toLocaleString()} tok · {formatAge(b.createdAt)}
										</Text>
									</VStack>
									<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => setDeletingBundleId(b.bundleId)}>
										<Trash2 size={12} />
									</Button>
								</HStack>
								{expanded && b.items.map(cp => (
									<CheckpointRow key={cp.id} cp={cp} indent={true} />
								))}
							</VStack>
						);
					})}

					{grouped.standalone.map(cp => (
						<HStack key={cp.id} gap="2" px="3" py="2" borderRadius="md" _hover={{ bg: 'rgba(255, 255, 255, 0.03)' }}>
							<VStack gap="0" align="stretch" flex="1">
								<HStack gap="2">
									{renamingId === cp.id ? (
										<Input
											size="xs"
											value={renameValue}
											onChange={(e) => setRenameValue(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === 'Enter') commitRename();
												if (e.key === 'Escape') { setRenamingId(null); setRenameValue(''); }
											}}
											onBlur={commitRename}
											autoFocus
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(51, 129, 255, 0.3)"
											color="#e4e4e7"
											fontSize="12px"
										/>
									) : (
										<Text fontSize="13px" color="#e4e4e7" fontWeight="500">{cp.name}</Text>
									)}
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
										Slot {cp.slotIndex} · {cp.tokens.toLocaleString()} tok · {formatBytes(cp.sizeBytes)} · {formatAge(cp.createdAt)}
									</Text>
								</HStack>
								<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>
									{cp.fingerprint.modelFilename}
								</Text>
							</VStack>
							<CheckpointActions cp={cp} />
						</HStack>
					))}
				</VStack>

				<Flex mt="3" justify="flex-end">
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
						Total disk usage: {formatBytes(totalDiskUsage)}
					</Text>
				</Flex>
			</Box>

			{deletingCheckpoint && (
				<ConfirmDialog
					isOpen={true}
					title="Delete checkpoint?"
					message={`This will remove the checkpoint for slot ${deletingCheckpoint.slotIndex}. This action cannot be undone.`}
					confirmLabel="Delete"
					loadingLabel="Deleting..."
					isLoading={false}
					onConfirm={() => handleDeleteOne(deletingCheckpoint.id)}
					onCancel={() => setDeletingCheckpointId(null)}
				/>
			)}
			{deletingBundleId && (
				<ConfirmDialog
					isOpen={true}
					title="Delete bundle?"
					message={`This will remove all ${deletingBundleItems.length} checkpoints in this bundle. This action cannot be undone.`}
					confirmLabel="Delete all"
					loadingLabel="Deleting..."
					isLoading={false}
					onConfirm={() => handleDeleteBundle(deletingBundleId)}
					onCancel={() => setDeletingBundleId(null)}
				/>
			)}
		</Box>
	);
}
