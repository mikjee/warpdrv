import React, { useState, useRef, useCallback, useEffect, useMemo, type FC, type ReactNode, type DragEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
	Box, Flex, Text, HStack, VStack, Input, Portal, Menu,
} from '@chakra-ui/react';
import {
	ThreadListPrimitive,
	ThreadListItemPrimitive,
	ThreadListItemMorePrimitive,
	AuiIf,
	useAuiState,
} from '@assistant-ui/react';
import {
	PlusIcon, MoreHorizontalIcon, TrashIcon, PencilIcon, CheckIcon,
	FolderIcon, FolderPlusIcon, SearchIcon, SortAscIcon, SortDescIcon,
	ChevronRightIcon, ChevronDownIcon, XIcon,
	FolderOpenIcon,
} from 'lucide-react';
import type { IChatThread as IBridgeChatThread, IFolder as IChatFolder } from '@warpcore/bridge';
import { useStore } from '@/store';
import { fetchWorkspace } from '@/api/services';
import {
	fetchFolders, fetchThreads, createFolder, updateFolder, deleteFolder, reorderFolders,
} from '@/api/services';

// Extend bridge thread type with computed fields from API
interface IChatThread extends IBridgeChatThread {
	messageCount?: number;
	totalTokens?: number;
}

// ============================================================
// Types
// ============================================================
type TSortField = 'updatedAt' | 'createdAt' | 'title' | 'messageCount';
type TSortDir = 'asc' | 'desc';

// ============================================================
// Hooks
// ============================================================
export function useThreadsAndFolders() {
	// Custom comparator to only re-render when thread IDs actually change
	const threads = useStore(useShallow(s => {
		const threadsArray = Object.values(s.threads) as IChatThread[];
		return threadsArray;
	}));
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const setThreads = useStore(s => s.setThreads);
	const folders = useStore(s => s.folders);
	const setFolders = useStore(s => s.setFolders);

	// Initial load
	useEffect(() => {
		if (Object.keys(useStore.getState().threads).length) return;
		Promise.all([fetchThreads(), fetchFolders()]).then(([tRes, fRes]) => {
			if (tRes.ok && tRes.data) {
				const threadsRecord = tRes.data.reduce((acc, t) => {
					(acc as any)[t.id] = t;
					return acc;
				}, {} as Record<string, IChatThread>);
				setThreads(threadsRecord);
			}
			if (fRes.ok) setFolders(fRes.data);
		});
	}, []);

	const patchThread = useCallback(async (id: string, patch: Partial<IChatThread>) => {
		const res = await fetch(`/api/chat/threads/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch),
		});
		// SSE will update store via applyThreadUpdated
		return res;
	}, []);

	const removeThread = useCallback(async (id: string) => {
		await fetch(`/api/chat/threads/${id}`, { method: 'DELETE' });
		const next: Record<string, IChatThread> = {};
		let changed = false;
		for (const [k, v] of Object.entries(threads)) {
			if (k !== id) {
				next[k] = v;
			} else {
				changed = true;
			}
		}
		// Only update if thread actually existed
		if (changed) setThreads(next);
	}, [threads]);

	const removeAllThreads = useCallback(async () => {
		if (threads.length === 0) return;
		for (const t of threads) {
			await fetch(`/api/chat/threads/${t.id}`, { method: 'DELETE' });
		}
		setThreads({} as Record<string, IChatThread>);
	}, [threads]);

	const addFolder = useCallback(async (name: string) => {
		const res = await createFolder(name);
		if (res.ok) setFolders([...folders, res.data]);
	}, [folders]);

	const patchFolder = useCallback(async (id: string, patch: Partial<IChatFolder>) => {
		await updateFolder(id, patch);
		setFolders(folders.map(f => f.id === id ? { ...f, ...patch } : f));
	}, [folders]);

	const removeFolder = useCallback(async (id: string) => {
		await deleteFolder(id);
		setFolders(folders.filter(f => f.id !== id));
		// Move threads from this folder to root
		const threadsRecord: Record<string, IChatThread> = {};
		let changed = false;
		for (const t of threads) {
			if (t.folderId === id) {
				threadsRecord[t.id] = { ...t, folderId: null };
				changed = true;
			} else {
				threadsRecord[t.id] = t;
			}
		}
		// Only update if threads were actually moved
		if (changed) setThreads(threadsRecord);
	}, [folders, threads]);

	const refreshFolders = useCallback(async () => {
		const fRes = await fetchFolders();
		if (fRes.ok) setFolders(fRes.data);
	}, []);

	return { threads, folders, patchThread, removeThread, removeAllThreads, addFolder, patchFolder, removeFolder, refreshFolders, setCurrentThreadId };
}

// ============================================================
// Inline rename popover
// ============================================================
function RenamePopover({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
	const [text, setText] = useState(value);
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
	return (
		<HStack gap="1" onClick={(e) => e.stopPropagation()}>
			<Input
				ref={ref}
				size="xs"
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => { if (e.key === 'Enter') onSave(text); if (e.key === 'Escape') onCancel(); }}
				bg="var(--wc-bg-card)"
				borderColor="var(--wc-border-hover)"
				color="var(--wc-text-primary)"
				fontSize="12px"
				h="26px"
				px="2"
			/>
			<Box cursor="pointer" onClick={() => onSave(text)} opacity={0.5} _hover={{ opacity: 0.8 }} p="1">
				<CheckIcon size={11} />
			</Box>
			<Box cursor="pointer" onClick={onCancel} opacity={0.3} _hover={{ opacity: 0.6 }} p="1">
				<XIcon size={11} />
			</Box>
		</HStack>
	);
}

// ============================================================
// Confirm dialog
// ============================================================
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
	return (
		<Box
			position="fixed" top="0" left="0" right="0" bottom="0"
			bg="var(--wc-overlay-modal)" zIndex={100}
			display="flex" alignItems="center" justifyContent="center"
			onClick={onCancel}
		>
			<Box
				bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)"
				borderRadius="lg" p="5" maxW="360px" w="90%"
				onClick={(e) => e.stopPropagation()}
			>
				<Text fontSize="13px" color="var(--wc-text-primary)" mb="4">{message}</Text>
				<HStack justify="flex-end" gap="2">
					<Box
						as="button" px="3" py="1.5" borderRadius="md" fontSize="12px"
						bg="var(--wc-bg-card)" color="var(--wc-text-secondary)"
						_hover={{ bg: 'var(--wc-bg-active)' }}
						onClick={onCancel}
					>Cancel</Box>
					<Box
						as="button" px="3" py="1.5" borderRadius="md" fontSize="12px"
						bg="var(--wc-accent-red-alt)" color="var(--wc-special-white)"
						_hover={{ bg: 'var(--wc-accent-red)' }}
						onClick={onConfirm}
					>Delete</Box>
				</HStack>
			</Box>
		</Box>
	);
}

// ============================================================
// Time formatting
// ============================================================
function timeAgo(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'now';
	if (mins < 60) return `${mins}m`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d`;
	return `${Math.floor(days / 30)}mo`;
}

// ============================================================
// Manual Thread List Item - uses plain Chakra UI (no assistant-ui primitives)
// ============================================================
function ManualThreadListItem({ thread, onRename, onStartDrag, onSelect, onDelete }: {
	thread: IChatThread;
	onRename: (id: string, title: string) => void;
	onStartDrag: (threadId: string) => void;
	onSelect: (threadId: string) => void;
	onDelete: (id: string) => void;
}) {
	const [renaming, setRenaming] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const getAnchorRect = useCallback(() => triggerRef.current?.getBoundingClientRect(), [triggerRef]);
	const currentThreadId = useStore(s => s.currentThreadId);
	const selected = thread.id === currentThreadId;

	return (
		<Box
			w="100%"
			className={`group ${selected ? 'selected' : ''}`}
			bg={selected ? 'var(--wc-bg-card)' : undefined}
			border={ selected ? '1px solid var(--wc-border-strong)' : undefined }
			draggable
			onDragStart={(e: any) => {
				e.dataTransfer.setData('threadId', thread.id);
				onStartDrag(thread.id);
			}}
			onClick={() => {
				onSelect(thread.id);
			}}
			style={{ minHeight: '32px', cursor: 'grab' }}
			display="flex"
			alignItems="center"
			gap="1"
			borderRadius="lg"
			px="3"
			py="1"
			_hover={{ bg: 'var(--wc-bg-hover)' }}
		>
			{renaming ? (
				<Box flex="1" px="2" py="1">
					<RenamePopover
						value={thread.title}
						onSave={(v) => { onRename(thread.id, v); setRenaming(false); }}
						onCancel={() => setRenaming(false)}
					/>
				</Box>
			) : (
				<>
					<Box flex="1" display="flex" flexDirection="column" overflow="hidden">
						<HStack>
							<Text fontSize="13px" color="var(--wc-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
								{thread.title ?? 'New Chat'}
							</Text>
							<Text fontSize="12px" color="var(--wc-text-faint)">
								{(() => { const total = (thread.totalPromptTokens ?? 0) + (thread.totalCompletionTokens ?? 0); return total > 0 ? `${(total / 1000).toFixed(1)}k` : (thread.messageCount ?? 0) > 0 ? `${thread.messageCount ?? 0} msg` : 'empty'; })()}
							</Text>
							{/* <Text fontSize="12px" color="rgba(255,255,255,0.35)">
								{timeAgo(thread.updatedAt)}
							</Text> */}
						</HStack>
					</Box>
			<Box position="relative">
					<Menu.Root positioning={{ getAnchorRect }}>
				<Menu.Trigger asChild>
						<Box
							ref={triggerRef as any}
							as="button"
							cursor="pointer"
							p="1"
							mr="1"
							borderRadius="sm"
							opacity={0}
							className="group-hover:!opacity-50"
							_hover={{ bg: 'var(--wc-bg-hover)' }}
							type="button"
							onClick={(e) => e.stopPropagation()}
						>
							<MoreHorizontalIcon size={13} />
						</Box>
					</Menu.Trigger>
						<Menu.Positioner>
							<Menu.Content
								bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)"
								borderRadius="md" py="1" minW="120px"
								onClick={(e) => e.stopPropagation()}
							>
								<Menu.Item
									value="rename"
									onClick={() => setRenaming(true)}
									style={{ fontSize: '12px', color: 'var(--wc-text-primary)' }}
								>
									<HStack gap="2">
										<PencilIcon size={12} />
										<Text>Rename</Text>
									</HStack>
								</Menu.Item>
								<Menu.Item
									value="delete"
									onClick={() => onDelete(thread.id)}
									style={{ fontSize: '12px', color: 'var(--wc-accent-red)' }}
								>
									<HStack gap="2">
										<TrashIcon size={12} />
										<Text>Delete</Text>
									</HStack>
								</Menu.Item>
							</Menu.Content>
						</Menu.Positioner>
					</Menu.Root>
				</Box>
			</>
			)}
		</Box>
	);
}

// ============================================================
// Folder section
// ============================================================
function FolderSection({
	folder,
	threads,
	onRename,
	onDelete,
	onDropThread,
	onReorderFolder,
	children,
}: {
	folder: IChatFolder;
	threads: IChatThread[];
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
	onDropThread: (threadId: string, folderId: string | null) => void;
	onReorderFolder: (fromFolderId: string, toFolderId: string) => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const folderMenuRef = useRef<HTMLButtonElement>(null);
	const getFolderAnchorRect = useCallback(() => folderMenuRef.current?.getBoundingClientRect(), [folderMenuRef]);
	const setActiveWorkspaceId = useStore(s => s.setActiveWorkspaceId);
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const setWorkspace = useStore(s => s.setWorkspace);

	const handleToggleOpen = () => {
		if (!open) {
			fetchWorkspace(folder.id).then(res => {
				if (res.ok && res.data) setWorkspace(res.data);
			});
			setActiveWorkspaceId(folder.id);
			setCurrentThreadId(globalThis.crypto.randomUUID());
			setOpen(true);
		} else {
			setOpen(false);
		}
	};

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		setDragOver(true);
	}
	function handleDragLeave() { setDragOver(false); }
	function handleDrop(e: DragEvent) {
		e.preventDefault();
		setDragOver(false);
		const threadId = e.dataTransfer.getData('threadId');
		if (threadId) onDropThread(threadId, folder.id);
	}

	// Folder reordering via drag-and-drop on folder header
	function handleFolderDragStart(e: DragEvent, folderId: string) {
		e.dataTransfer.setData('folderId', folderId);
		e.dataTransfer.effectAllowed = 'move';
	}
	function handleFolderDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
	}
	function handleFolderDrop(e: DragEvent) {
		e.preventDefault();
		const fromFolderId = e.dataTransfer.getData('folderId');
		if (fromFolderId && fromFolderId !== folder.id) {
			onReorderFolder(fromFolderId, folder.id);
		}
	}

		return (
			<Box
				w="full"
				onDragOver={handleDragOver}
				onDragLeave={handleDragLeave}
				onDrop={handleDrop}
				bg={dragOver ? 'var(--wc-accent-blue-bg-10)' : 'var(--wc-bg-subtle)'}
				my="1"
				borderRadius="lg"
				transition="background 0.15s"
				border="1px solid var(--wc-border-default)"
			>
			<HStack
					gap="1" px="2" py="1.5" cursor="grab"
					borderRadius="md"
					_hover={{ bg: 'var(--wc-bg-card)' }}
					onClick={handleToggleOpen}
					position="relative"
					draggable
					onDragStart={(e) => handleFolderDragStart(e, folder.id)}
					onDragOver={handleFolderDragOver}
					onDrop={handleFolderDrop}
					data-foldertype="folder"
				>
				{open
					? <ChevronDownIcon size={12} style={{ flexShrink: 0, color: "var(--wc-text-muted)" }} />
					: <ChevronRightIcon size={12} style={{ flexShrink: 0, color: "var(--wc-text-muted)" }} />
				}
				{open
					? <FolderOpenIcon size={14} style={{ flexShrink: 0, color: "var(--wc-text-muted)" }} />
					: <FolderIcon size={14} style={{ flexShrink: 0, color: "var(--wc-text-muted)" }} />
				}
				{renaming ? (
					<RenamePopover
						value={folder.name}
						onSave={(v) => { onRename(folder.id, v); setRenaming(false); }}
						onCancel={() => setRenaming(false)}
					/>
				) : (
					<Text flex="1" fontSize="14px" fontWeight="500" color="var(--wc-text-secondary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" ml="1">
						{folder.name}
					</Text>
				)}
				<Text fontSize="12px" color="var(--wc-text-faint)" flexShrink={0}>{threads.length}</Text>
				<Menu.Root positioning={{ getFolderAnchorRect }}>
					<Menu.Trigger asChild>
						<Box
							ref={folderMenuRef as any}
							as="button"
							opacity={0.4}
							cursor="pointer" p="0.5"
							className="group-hover:!opacity-100"
							_hover={{ opacity: 1, bg: 'var(--wc-bg-hover)' }}
							borderRadius="sm"
							type="button"
							onClick={(e) => e.stopPropagation()}
						>
							<MoreHorizontalIcon size={12} />
						</Box>
					</Menu.Trigger>
					<Menu.Positioner>
						<Menu.Content
							bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)"
							borderRadius="md" py="1" minW="120px"
							onClick={(e) => e.stopPropagation()}
						>
							<Menu.Item
								value="rename"
								onClick={() => setRenaming(true)}
								style={{ fontSize: '12px', color: 'var(--wc-text-primary)' }}
							>
								<HStack gap="2">
									<PencilIcon size={12} />
									<Text>Rename</Text>
								</HStack>
							</Menu.Item>
							<Menu.Item
								value="delete"
								onClick={() => onDelete(folder.id)}
								style={{ fontSize: '12px', color: 'var(--wc-accent-red)' }}
							>
								<HStack gap="2">
									<TrashIcon size={12} />
									<Text>Delete</Text>
								</HStack>
							</Menu.Item>
						</Menu.Content>
					</Menu.Positioner>
				</Menu.Root>
			</HStack>
			{open && (
				<Box pl="4" my="1">
					{children}
					{threads.length === 0 && (
						<Text fontSize="11px" color="var(--wc-text-disabled)" px="2" py="1">Drop threads here</Text>
					)}
				</Box>
			)}
		</Box>
	);
}

// ============================================================
// Main ThreadList component
// ============================================================

export const ThreadList: FC<{ onOpenSearch?: () => void }> = React.memo(({ onOpenSearch }) => {
	const threadsAPI = useThreadsAndFolders();
	const [search, setSearch] = useState('');
	const [sortField, setSortField] = useState<TSortField>('updatedAt');
	const [sortDir, setSortDir] = useState<TSortDir>('desc');
	const [confirmDelete, setConfirmDelete] = useState<{ type: 'folder' | 'allChats' | 'thread'; id?: string } | null>(null);
	const [draggingThread, setDraggingThread] = useState<string | null>(null);
	const [rootDragOver, setRootDragOver] = useState(false);

	const filteredThreads = useMemo(() => threadsAPI.threads.filter((t) => {
		if (!search) return true;
		return t.title.toLowerCase().includes(search.toLowerCase());
	}), [threadsAPI.threads, search]);

	const sortedThreads = useMemo(() => [...filteredThreads].sort((a, b) => {
		let cmp = 0;
		if (sortField === 'updatedAt') cmp = a.updatedAt - b.updatedAt;
		else if (sortField === 'createdAt') cmp = a.createdAt - b.createdAt;
		else if (sortField === 'title') cmp = a.title.localeCompare(b.title);
		else if (sortField === 'messageCount') cmp = ((a.totalPromptTokens ?? 0) + (a.totalCompletionTokens ?? 0)) - ((b.totalPromptTokens ?? 0) + (b.totalCompletionTokens ?? 0));
		return sortDir === 'desc' ? -cmp : cmp;
	}), [filteredThreads, sortField, sortDir]);

	const rootThreads = useMemo(() => sortedThreads.filter((t) => !t.folderId), [sortedThreads]);
	const threadsByFolderMap = useMemo(() => {
		const map: Record<string, IChatThread[]> = {};
		for (const folder of threadsAPI.folders) {
			map[folder.id] = sortedThreads.filter((t) => t.folderId === folder.id);
		}
		return map;
	}, [sortedThreads, threadsAPI.folders]);

	const handleRenameThread = useCallback(async (id: string, title: string) => {
		const res = await threadsAPI.patchThread(id, { title });
		if (!res?.ok) {
			console.error('Failed to rename thread:', id);
		}
	}, [threadsAPI.patchThread]);

	const handleRenameFolder = useCallback(async (id: string, name: string) => {
		await threadsAPI.patchFolder(id, { name });
	}, [threadsAPI.patchFolder]);

	const handleCreateFolder = useCallback(async () => {
		await threadsAPI.addFolder('New Folder');
	}, [threadsAPI.addFolder]);

	const handleDeleteFolder = useCallback(async (id: string) => {
		setConfirmDelete({ type: 'folder', id });
	}, []);

	const handleDeleteThread = useCallback((id: string) => {
		setConfirmDelete({ type: 'thread', id });
	}, []);

	const handleConfirmDeleteThread = useCallback(async (id: string) => {
		await threadsAPI.removeThread(id);
		setConfirmDelete(null);
	}, [threadsAPI.removeThread]);

	const handleConfirmDeleteFolder = useCallback(async (id: string) => {
		await threadsAPI.removeFolder(id);
		setConfirmDelete(null);
	}, [threadsAPI.removeFolder]);

	const handleDeleteAllChats = useCallback(async () => {
		setConfirmDelete({ type: 'allChats' });
	}, []);

	// Folder reordering via drag-and-drop
	const handleReorderFolders = useCallback(async (fromFolderId: string, toFolderId: string) => {
		if (fromFolderId === toFolderId) return;
		const folders = threadsAPI.folders;
		const fromIdx = folders.findIndex(f => f.id === fromFolderId);
		const toIdx = folders.findIndex(f => f.id === toFolderId);
		if (fromIdx === -1 || toIdx === -1) return;
		// Calculate new sort orders: shift folders between from and to
		const updates: Array<{ id: string; sortOrder: number }> = [];
		if (fromIdx < toIdx) {
			// Moving down: shift folders from fromIdx+1 to toIdx up by 1
			for (let i = fromIdx + 1; i <= toIdx; i++) {
				const f = folders[i];
				if (f) updates.push({ id: f.id, sortOrder: f.sortOrder - 1 });
			}
			const toFolder = folders[toIdx];
			if (toFolder) updates.push({ id: fromFolderId, sortOrder: toFolder.sortOrder });
		} else {
			// Moving up: shift folders from toIdx to fromIdx-1 down by 1
			for (let i = toIdx; i < fromIdx; i++) {
				const f = folders[i];
				if (f) updates.push({ id: f.id, sortOrder: f.sortOrder + 1 });
			}
			const toFolder = folders[toIdx];
			if (toFolder) updates.push({ id: fromFolderId, sortOrder: toFolder.sortOrder });
		}
		await reorderFolders(updates);
		// Refresh folders from server
		await threadsAPI.refreshFolders();
	}, [threadsAPI.folders, threadsAPI.refreshFolders]);

	const handleConfirmDeleteAllChats = useCallback(async () => {
		await threadsAPI.removeAllThreads();
		setConfirmDelete(null);
	}, [threadsAPI.removeAllThreads]);

	const handleDropThread = useCallback(async (threadId: string, folderId: string | null) => {
		await threadsAPI.patchThread(threadId, { folderId });
		setDraggingThread(null);
	}, [threadsAPI.patchThread]);

	const handleRootDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setRootDragOver(true);
	}, []);

	const handleRootDragLeave = useCallback(() => { setRootDragOver(false); }, []);

	const handleRootDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setRootDragOver(false);
		const threadId = (e as any).dataTransfer.getData('threadId');
		if (threadId) handleDropThread(threadId, null);
	}, [handleDropThread]);

	const handleSelectThread = useCallback((threadId: string) => {
		threadsAPI.setCurrentThreadId(threadId);
	}, [threadsAPI.setCurrentThreadId]);

	const cycleSortField = useCallback(() => {
		const fields: TSortField[] = ['updatedAt', 'createdAt', 'title', 'messageCount'];
		const idx = fields.indexOf(sortField);
		setSortField(fields[(idx + 1) % fields.length]!);
	}, [sortField]);

	const sortLabels = useMemo(() => ({
		updatedAt: 'Updated',
		createdAt: 'Created',
		title: 'Name',
		messageCount: 'Tokens',
	}), []);

	return (
		<ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col flex-1 min-h-0">
			{onOpenSearch && (
				<Box flexShrink={0} mb="2" px="3">
					<Box
						as="button"
						w="full"
						px="3"
						py="2"
						borderRadius="md"
						borderWidth="1px"
						borderColor="var(--wc-border-subtle)"
						bg="var(--wc-bg-card)"
						color="var(--wc-text-muted)"
						_hover={{ bg: 'var(--wc-bg-hover)', color: 'var(--wc-text-primary)' }}
						display="flex"
						alignItems="center"
						justifyContent="center"
						gap="2"
						fontSize="13px"
						cursor="pointer"
						onClick={onOpenSearch}
					>
						<SearchIcon size={15} />
						<Text>Search</Text>
					</Box>
				</Box>
			)}

			<HStack px="3" gap="1" mb="2" justify="space-between" alignItems={"center"} flexShrink={0}>
				<HStack gap="1">
					<Box
						as="button" px="2.5" py="1" borderRadius="md" fontSize="12px"
						color="var(--wc-text-muted)" bg="var(--wc-bg-subtle)"
						_hover={{ bg: 'var(--wc-bg-hover)' }}
						onClick={cycleSortField}
						title="Click to change sort field"
					>
						{sortLabels[sortField]}
					</Box>
					<Box
						as="button" p="1" borderRadius="md"
						color="var(--wc-text-faint)"
						_hover={{ color: 'var(--wc-text-tertiary)' }}
						onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
						title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
					>
						{sortDir === 'desc' ? <SortDescIcon size={16} /> : <SortAscIcon size={16} />}
					</Box>
				</HStack>
				<HStack gap="1">
					<Box
						as="button" p="1" borderRadius="md"
						color="var(--wc-text-faint)"
						_hover={{ color: 'var(--wc-text-secondary)' }}
						onClick={handleCreateFolder}
						title="New folder"
						mt="1"
					>
						<FolderPlusIcon size={16} />
					</Box>
				</HStack>
			</HStack>

			{/* Scrollable thread list */}
			<Box px="3" flex="1" overflowY="auto" css={{ '&::-webkit-scrollbar': { width: '4px' }, '&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' } }} borderTop="1px solid var(--wc-border-subtle)" pt="2">
				<VStack align="start" gap="0" w="full">
				{threadsAPI.folders.map((f) => (
					<FolderSection
						key={f.id}
						folder={f}
						threads={threadsByFolderMap[f.id] ?? []}
						onRename={handleRenameFolder}
						onDelete={handleDeleteFolder}
						onDropThread={handleDropThread}
						onReorderFolder={handleReorderFolders}
						w="full"
					>
						<VStack gap="1" align="start" w="full">
							{(threadsByFolderMap[f.id] ?? []).map(thread => (
								<ManualThreadListItem 
									key={thread.id}
									thread={thread}
									onRename={handleRenameThread}
									onStartDrag={setDraggingThread}
									onSelect={handleSelectThread}
									onDelete={handleDeleteThread}
									w="full"
								/>
							))}
						</VStack>
					</FolderSection>
				))}

				<Box
					onDragOver={handleRootDragOver as any}
					onDragLeave={handleRootDragLeave}
					onDrop={handleRootDrop as any}
					bg={rootDragOver ? 'var(--wc-bg-hover)' : 'transparent'}
					borderRadius="md"
					transition="background 0.15s"
					w="full"
					py="1"
				>
					<VStack gap="1" align="start" w="full">
						{rootThreads.map(thread => (
							<ManualThreadListItem 
								key={thread.id}
								thread={thread}
								onRename={handleRenameThread}
								onStartDrag={setDraggingThread}
								onSelect={handleSelectThread}
								onDelete={handleDeleteThread}
								w="full"
							/>
						))}
					</VStack>
				</Box>
				</VStack>
			</Box>

			{confirmDelete && (
				<Portal>
					<ConfirmDialog
						message={
							confirmDelete.type === 'folder'
								? 'Delete this folder? Threads inside will be moved to root.'
								: confirmDelete.type === 'thread'
									? 'Delete this thread? This cannot be undone.'
									: 'Delete ALL chats? This cannot be undone.'
						}
						onConfirm={() => {
							if (confirmDelete.type === 'folder' && confirmDelete.id) handleConfirmDeleteFolder(confirmDelete.id);
							else if (confirmDelete.type === 'thread' && confirmDelete.id) handleConfirmDeleteThread(confirmDelete.id);
							else if (confirmDelete.type === 'allChats') handleConfirmDeleteAllChats();
						}}
						onCancel={() => setConfirmDelete(null)}
					/>
				</Portal>
			)}
		</ThreadListPrimitive.Root>
	);
});
