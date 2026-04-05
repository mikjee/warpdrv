import { useState, useRef, useCallback, useEffect, type FC, type ReactNode, type DragEvent } from 'react';
import {
	Box, Flex, Text, HStack, VStack, Input, Portal,
} from '@chakra-ui/react';
import {
	ThreadListPrimitive,
	ThreadListItemPrimitive,
	ThreadListItemMorePrimitive,
	AuiIf,
	useAuiState,
} from '@assistant-ui/react';
import {
	PlusIcon, MoreHorizontalIcon, TrashIcon, PencilIcon,
	FolderIcon, FolderPlusIcon, SearchIcon, SortAscIcon, SortDescIcon,
	FilterIcon, ChevronRightIcon, ChevronDownIcon, XIcon,
	FolderOpenIcon, MessageSquareIcon,
} from 'lucide-react';
import type { IChatThread as IBridgeChatThread, IFolder as IChatFolder } from '@warpcore/bridge';

// Extend bridge thread type with computed fields from API
interface IChatThread extends IBridgeChatThread {
	messageCount?: number;
	totalTokens?: number;
}

import {
	fetchThreads, fetchFolders, updateThread,
	createFolder, updateFolder, deleteFolder, deleteThread,
} from '../../api/services';

// ============================================================
// Types
// ============================================================
type TSortField = 'updatedAt' | 'createdAt' | 'title' | 'messageCount';
type TSortDir = 'asc' | 'desc';

// ============================================================
// Hooks
// ============================================================
function useThreadsAndFolders() {
	const [threads, setThreads] = useState<IChatThread[]>([]);
	const [folders, setFolders] = useState<IChatFolder[]>([]);

	useEffect(() => {
		Promise.all([fetchThreads(), fetchFolders()]).then(([tRes, fRes]) => {
			if (tRes.ok) setThreads(tRes.data);
			if (fRes.ok) setFolders(fRes.data);
		});
	}, []);

	async function patchThread(id: string, patch: Partial<IChatThread>) {
		const res = await updateThread(id, patch);
		if (res.ok) {
			setThreads(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
		}
		return res;
	}

	async function removeThread(id: string) {
		await deleteThread(id);
		setThreads(prev => prev.filter(t => t.id !== id));
	}

	async function removeAllThreads() {
		for (const t of threads) await deleteThread(t.id);
		setThreads([]);
	}

	async function addFolder(name: string) {
		const res = await createFolder(name);
		if (res.ok) setFolders(prev => [...prev, res.data]);
	}

	async function patchFolder(id: string, patch: Partial<IChatFolder>) {
		await updateFolder(id, patch);
		setFolders(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
	}

	async function removeFolder(id: string) {
		await deleteFolder(id);
		setFolders(prev => prev.filter(f => f.id !== id));
		setThreads(prev => prev.map(t => t.folderId === id ? { ...t, folderId: null } : t));
	}

	return { threads, folders, patchThread, removeThread, removeAllThreads, addFolder, patchFolder, removeFolder };
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
				bg="rgba(255,255,255,0.06)"
				borderColor="rgba(255,255,255,0.12)"
				color="rgba(255,255,255,0.8)"
				fontSize="12px"
				h="26px"
				px="2"
			/>
			<Box cursor="pointer" onClick={() => onSave(text)} opacity={0.5} _hover={{ opacity: 0.8 }} p="1">
				<PencilIcon size={11} />
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
			bg="rgba(0,0,0,0.5)" zIndex={100}
			display="flex" alignItems="center" justifyContent="center"
			onClick={onCancel}
		>
			<Box
				bg="#1e1e1e" borderWidth="1px" borderColor="rgba(255,255,255,0.1)"
				borderRadius="lg" p="5" maxW="360px" w="90%"
				onClick={(e) => e.stopPropagation()}
			>
				<Text fontSize="13px" color="rgba(255,255,255,0.8)" mb="4">{message}</Text>
				<HStack justify="flex-end" gap="2">
					<Box
						as="button" px="3" py="1.5" borderRadius="md" fontSize="12px"
						bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.6)"
						_hover={{ bg: 'rgba(255,255,255,0.1)' }}
						onClick={onCancel}
					>Cancel</Box>
					<Box
						as="button" px="3" py="1.5" borderRadius="md" fontSize="12px"
						bg="rgba(220,50,50,0.8)" color="white"
						_hover={{ bg: 'rgba(220,50,50,1)' }}
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
// Folder section
// ============================================================
function FolderSection({
	folder,
	threads,
	onRename,
	onDelete,
	onDropThread,
	children,
}: {
	folder: IChatFolder;
	threads: IChatThread[];
	onRename: (id: string, name: string) => void;
	onDelete: (id: string) => void;
	onDropThread: (threadId: string, folderId: string | null) => void;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(true);
	const [renaming, setRenaming] = useState(false);
	const [dragOver, setDragOver] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

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

	return (
		<Box
			mb="1"
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			bg={dragOver ? 'rgba(100,150,255,0.08)' : 'transparent'}
			borderRadius="md"
			transition="background 0.15s"
		>
			<HStack
				gap="1" px="2" py="1.5" cursor="pointer"
				borderRadius="md"
				_hover={{ bg: 'rgba(255,255,255,0.04)' }}
				onClick={() => setOpen(!open)}
				position="relative"
			>
				{open
					? <ChevronDownIcon size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
					: <ChevronRightIcon size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
				}
				{open
					? <FolderOpenIcon size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
					: <FolderIcon size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
				}
				{renaming ? (
					<RenamePopover
						value={folder.name}
						onSave={(v) => { onRename(folder.id, v); setRenaming(false); }}
						onCancel={() => setRenaming(false)}
					/>
				) : (
					<Text flex="1" fontSize="12px" fontWeight="500" color="rgba(255,255,255,0.5)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
						{folder.name}
					</Text>
				)}
				<Text fontSize="10px" color="rgba(255,255,255,0.2)" flexShrink={0}>{threads.length}</Text>
				<Box
					onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
					opacity={0} _groupHover={{ opacity: 1 }}
					cursor="pointer" p="0.5"
					className="group-hover:!opacity-60"
					_hover={{ opacity: 1 }}
				>
					<MoreHorizontalIcon size={12} />
				</Box>
				{menuOpen && (
					<Box
						position="absolute" right="0" top="100%" zIndex={50}
						bg="#1a1a1a" borderWidth="1px" borderColor="rgba(255,255,255,0.1)"
						borderRadius="md" py="1" minW="120px"
						onClick={(e) => e.stopPropagation()}
					>
						<HStack
							px="2" py="1.5" gap="2" cursor="pointer" fontSize="12px" color="rgba(255,255,255,0.7)"
							_hover={{ bg: 'rgba(255,255,255,0.05)' }}
							onClick={() => { setRenaming(true); setMenuOpen(false); }}
						>
							<PencilIcon size={12} />
							<Text>Rename</Text>
						</HStack>
						<HStack
							px="2" py="1.5" gap="2" cursor="pointer" fontSize="12px" color="rgba(220,80,80,0.8)"
							_hover={{ bg: 'rgba(220,80,80,0.08)' }}
							onClick={() => { onDelete(folder.id); setMenuOpen(false); }}
						>
							<TrashIcon size={12} />
							<Text>Delete</Text>
						</HStack>
					</Box>
				)}
			</HStack>
			{open && (
				<Box pl="4">
					{children}
					{threads.length === 0 && (
						<Text fontSize="11px" color="rgba(255,255,255,0.15)" px="2" py="1">Drop threads here</Text>
					)}
				</Box>
			)}
		</Box>
	);
}

// ============================================================
// Enhanced Thread List Item (wraps assistant-ui primitives)
// ============================================================
function EnhancedThreadListItem({ thread, onRename, onStartDrag }: {
	thread: IChatThread;
	onRename: (id: string, title: string) => void;
	onStartDrag: (threadId: string) => void;
}) {
	const [renaming, setRenaming] = useState(false);

	return (
		<ThreadListItemPrimitive.Root
			className="aui-thread-list-item group flex items-center gap-1 rounded-lg transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none data-active:bg-muted"
			draggable
			onDragStart={(e: any) => {
				e.dataTransfer.setData('threadId', thread.id);
				onStartDrag(thread.id);
			}}
			style={{ minHeight: '40px', cursor: 'grab' }}
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
				<ThreadListItemPrimitive.Trigger className="aui-thread-list-item-trigger flex min-w-0 flex-1 flex-col px-2.5 py-1.5 text-start">
					<Text fontSize="12px" color="rgba(255,255,255,0.75)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" lineHeight="1.3">
						{thread.title ?? 'New Chat'}
					</Text>
					<HStack gap="2" mt="0.5">
					  <Text fontSize="10px" color="rgba(255,255,255,0.25)" fontFamily="mono">
                            {(thread.totalTokens ?? 0) > 0 ? `${((thread.totalTokens ?? 0) / 1000).toFixed(1)}k tok` : (thread.messageCount ?? 0) > 0 ? `${thread.messageCount ?? 0} msg` : 'empty'}
						</Text>
						<Text fontSize="10px" color="rgba(255,255,255,0.2)">
							{timeAgo(thread.updatedAt)}
						</Text>
					</HStack>
				</ThreadListItemPrimitive.Trigger>
			)}
			<ThreadListItemMorePrimitive.Root>
				<ThreadListItemMorePrimitive.Trigger asChild>
					<Box
						cursor="pointer" p="1" mr="1" borderRadius="sm"
						opacity={0} className="group-hover:!opacity-50 group-data-active:!opacity-50"
						_hover={{ bg: 'rgba(255,255,255,0.06)' }}
					>
						<MoreHorizontalIcon size={13} />
					</Box>
				</ThreadListItemMorePrimitive.Trigger>
				<ThreadListItemMorePrimitive.Content
					side="bottom" align="start"
					className="aui-thread-list-item-more-content z-50 min-w-32 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
				>
					<ThreadListItemMorePrimitive.Item
						className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
						onClick={() => setRenaming(true)}
					>
						<PencilIcon className="size-4" />
						Rename
					</ThreadListItemMorePrimitive.Item>
					<ThreadListItemPrimitive.Delete asChild>
						<ThreadListItemMorePrimitive.Item className="aui-thread-list-item-more-item flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-destructive text-sm outline-none hover:bg-destructive/10">
							<TrashIcon className="size-4" />
							Delete
						</ThreadListItemMorePrimitive.Item>
					</ThreadListItemPrimitive.Delete>
				</ThreadListItemMorePrimitive.Content>
			</ThreadListItemMorePrimitive.Root>
		</ThreadListItemPrimitive.Root>
	);
}

// ============================================================
// Main ThreadList component
// ============================================================

export const ThreadList: FC = () => {
	const threadsAPI = useThreadsAndFolders();
	const [search, setSearch] = useState('');
	const [sortField, setSortField] = useState<TSortField>('updatedAt');
	const [sortDir, setSortDir] = useState<TSortDir>('desc');
	const [confirmDelete, setConfirmDelete] = useState<{ type: 'folder' | 'allChats'; id?: string } | null>(null);
	const [draggingThread, setDraggingThread] = useState<string | null>(null);
	const [rootDragOver, setRootDragOver] = useState(false);

	const filteredThreads = threadsAPI.threads.filter((t) => {
		if (!search) return true;
		return t.title.toLowerCase().includes(search.toLowerCase());
	});

	const sortedThreads = [...filteredThreads].sort((a, b) => {
		let cmp = 0;
		if (sortField === 'updatedAt') cmp = a.updatedAt - b.updatedAt;
		else if (sortField === 'createdAt') cmp = a.createdAt - b.createdAt;
		else if (sortField === 'title') cmp = a.title.localeCompare(b.title);
		else if (sortField === 'messageCount') cmp = (a.totalTokens ?? 0) - (b.totalTokens ?? 0);
		return sortDir === 'desc' ? -cmp : cmp;
	});

	const rootThreads = sortedThreads.filter((t) => !t.folderId);
	const threadsByFolder = (folderId: string) => sortedThreads.filter((t) => t.folderId === folderId);

	async function handleRenameThread(id: string, title: string) {
		const res = await threadsAPI.patchThread(id, { title });
		if (!res?.ok) {
			console.error('Failed to rename thread:', id);
		}
	}

	async function handleRenameFolder(id: string, name: string) {
		await threadsAPI.patchFolder(id, { name });
	}

	async function handleCreateFolder() {
		await threadsAPI.addFolder('New Folder');
	}

	async function handleDeleteFolder(id: string) {
		setConfirmDelete({ type: 'folder', id });
	}

	async function handleConfirmDeleteFolder(id: string) {
		await threadsAPI.removeFolder(id);
		setConfirmDelete(null);
	}

	async function handleDeleteAllChats() {
		setConfirmDelete({ type: 'allChats' });
	}

	async function handleConfirmDeleteAllChats() {
		await threadsAPI.removeAllThreads();
		setConfirmDelete(null);
	}

	async function handleDropThread(threadId: string, folderId: string | null) {
		await threadsAPI.patchThread(threadId, { folderId });
		setDraggingThread(null);
	}

	function handleRootDragOver(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		setRootDragOver(true);
	}

	function handleRootDragLeave() { setRootDragOver(false); }

	function handleRootDrop(e: DragEvent<HTMLDivElement>) {
		e.preventDefault();
		setRootDragOver(false);
		const threadId = (e as any).dataTransfer.getData('threadId');
		if (threadId) handleDropThread(threadId, null);
	}

	function cycleSortField() {
		const fields: TSortField[] = ['updatedAt', 'createdAt', 'title', 'messageCount'];
		const idx = fields.indexOf(sortField);
		setSortField(fields[(idx + 1) % fields.length]!);
	}

	const sortLabels: Record<TSortField, string> = {
		updatedAt: 'Updated',
		createdAt: 'Created',
		title: 'Name',
		messageCount: 'Tokens',
	};

	return (
		<ThreadListPrimitive.Root className="aui-root aui-thread-list-root flex flex-col gap-0">
			<Box mb="2">
				<HStack
					gap="1" px="2" py="1.5"
					borderRadius="md" borderWidth="1px"
					borderColor="rgba(255,255,255,0.06)"
					bg="rgba(255,255,255,0.03)"
				>
					<SearchIcon size={13} style={{ opacity: 0.3, flexShrink: 0 }} />
					<Input
						variant="subtle"
						placeholder="Search threads..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						fontSize="12px"
						color="rgba(255,255,255,0.7)"
						h="20px"
					/>
					{search && (
						<Box cursor="pointer" onClick={() => setSearch('')} opacity={0.3} _hover={{ opacity: 0.6 }}>
							<XIcon size={12} />
						</Box>
					)}
				</HStack>
			</Box>

			<HStack gap="1" mb="2" px="1" justify="space-between">
				<HStack gap="1">
					<Box
						as="button" px="2" py="1" borderRadius="md" fontSize="10px"
						color="rgba(255,255,255,0.4)" bg="rgba(255,255,255,0.03)"
						_hover={{ bg: 'rgba(255,255,255,0.06)' }}
						onClick={cycleSortField}
						title="Click to change sort field"
					>
						{sortLabels[sortField]}
					</Box>
					<Box
						as="button" p="1" borderRadius="md"
						color="rgba(255,255,255,0.3)"
						_hover={{ color: 'rgba(255,255,255,0.6)' }}
						onClick={() => setSortDir(sortDir === 'desc' ? 'asc' : 'desc')}
						title={sortDir === 'desc' ? 'Newest first' : 'Oldest first'}
					>
						{sortDir === 'desc' ? <SortDescIcon size={12} /> : <SortAscIcon size={12} />}
					</Box>
				</HStack>
				<HStack gap="1">
					<Box
						as="button" p="1" borderRadius="md"
						color="rgba(255,255,255,0.3)"
						_hover={{ color: 'rgba(255,255,255,0.6)' }}
						onClick={handleCreateFolder}
						title="New folder"
					>
						<FolderPlusIcon size={13} />
					</Box>
				</HStack>
			</HStack>

			{threadsAPI.folders.map((f) => (
				<FolderSection
					key={f.id}
					folder={f}
					threads={threadsByFolder(f.id)}
					onRename={handleRenameFolder}
					onDelete={handleDeleteFolder}
					onDropThread={handleDropThread}
				>
					<ThreadListPrimitive.Items>
						{() => {
							const fThreads = threadsByFolder(f.id);
							return <ThreadListFilteredItems threads={fThreads} onRename={handleRenameThread} onStartDrag={setDraggingThread} />;
						}}
					</ThreadListPrimitive.Items>
				</FolderSection>
			))}

			<Box
				onDragOver={handleRootDragOver as any}
				onDragLeave={handleRootDragLeave}
				onDrop={handleRootDrop as any}
				bg={rootDragOver ? 'rgba(100,150,255,0.05)' : 'transparent'}
				borderRadius="md"
				transition="background 0.15s"
			>
				<AuiIf condition={(s) => s.threads.isLoading}>
					<VStack gap="1" p="1">
						{[0, 1, 2].map((i) => (
							<Box key={i} h="40px" bg="rgba(255,255,255,0.03)" borderRadius="md" w="100%" />
						))}
					</VStack>
				</AuiIf>
				<AuiIf condition={(s) => !s.threads.isLoading}>
					<ThreadListPrimitive.Items>
						{() => <ThreadListRootItem threads={rootThreads} onRename={handleRenameThread} onStartDrag={setDraggingThread} />}
					</ThreadListPrimitive.Items>
				</AuiIf>
			</Box>

			<Box mt="2" pt="2" borderTopWidth="1px" borderColor="rgba(255,255,255,0.04)">
				<ThreadListPrimitive.New asChild>
					<Box
						as="button"
						w="100%" px="3" py="2"
						borderRadius="md" borderWidth="1px"
						borderColor="rgba(255,255,255,0.06)"
						bg="rgba(255,255,255,0.02)"
						_hover={{ bg: 'rgba(255,255,255,0.05)' }}
						display="flex" alignItems="center" gap="2"
						fontSize="12px" color="rgba(255,255,255,0.4)"
						cursor="pointer"
					>
						<PlusIcon size={14} />
						<Text>New Thread</Text>
					</Box>
				</ThreadListPrimitive.New>
			</Box>

			{confirmDelete && (
				<Portal>
					<ConfirmDialog
						message={
							confirmDelete.type === 'folder'
								? 'Delete this folder? Threads inside will be moved to root.'
								: 'Delete ALL chats? This cannot be undone.'
						}
						onConfirm={() => {
							if (confirmDelete.type === 'folder' && confirmDelete.id) handleConfirmDeleteFolder(confirmDelete.id);
							else if (confirmDelete.type === 'allChats') handleConfirmDeleteAllChats();
						}}
						onCancel={() => setConfirmDelete(null)}
					/>
				</Portal>
			)}
		</ThreadListPrimitive.Root>
	);
};


// ============================================================
// Helper: renders only items matching a thread filter
// ThreadListPrimitive.Items renders ALL items — we filter visually
// ============================================================
function ThreadListRootItem({ threads, onRename, onStartDrag }: {
	threads: IChatThread[];
	onRename: (id: string, title: string) => void;
	onStartDrag: (threadId: string) => void;
}) {
	// Get current item's remoteId to check if it's a root thread
	const remoteId = useAuiState((s) => s.threadListItem?.remoteId);
	const thread = threads.find((t) => t.id === remoteId);
	if (!thread) return null; // Not a root thread, hide it
	return <EnhancedThreadListItem thread={thread} onRename={onRename} onStartDrag={onStartDrag} />;
}

function ThreadListFilteredItems({ threads, onRename, onStartDrag }: {
	threads: IChatThread[];
	onRename: (id: string, title: string) => void;
	onStartDrag: (threadId: string) => void;
}) {
	const remoteId = useAuiState((s) => s.threadListItem?.remoteId);
	const thread = threads.find((t) => t.id === remoteId);
	if (!thread) return null;
	return <EnhancedThreadListItem thread={thread} onRename={onRename} onStartDrag={onStartDrag} />;
}