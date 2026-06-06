import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Box, Text, HStack, VStack, Input, Textarea } from '@chakra-ui/react';
import { PencilIcon, CheckIcon, XIcon } from 'lucide-react';
import type { IFolder as IChatFolder, IChatThread as IBridgeChatThread } from '@warpcore/bridge';
import { useStore } from '@/store';
import { updateFolder, updateWorkspace, fetchWorkspace } from '@/api/services';

interface IChatThread extends IBridgeChatThread {
	messageCount?: number;
	totalTokens?: number;
}

function formatDate(ts: number): string {
	const d = new Date(ts);
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function WorkspaceRenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
	const [text, setText] = useState(value);
	const ref = useRef<HTMLInputElement>(null);
	useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
	return (
		<HStack gap="1" onClick={(e) => e.stopPropagation()}>
			<Input
				ref={ref}
				size="sm"
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => { if (e.key === 'Enter') onSave(text); if (e.key === 'Escape') onCancel(); }}
				bg="var(--wc-bg-card)"
				borderColor="var(--wc-border-hover)"
				color="var(--wc-text-primary)"
			/>
			<Box cursor="pointer" onClick={() => onSave(text)} opacity={0.5} _hover={{ opacity: 0.8 }} p="1">
				<CheckIcon size={14} />
			</Box>
			<Box cursor="pointer" onClick={onCancel} opacity={0.3} _hover={{ opacity: 0.6 }} p="1">
				<XIcon size={14} />
			</Box>
		</HStack>
	);
}

interface WorkspaceThreadRowProps {
	thread: IChatThread;
	onSelect: (threadId: string) => void;
}
function WorkspaceThreadRow({ thread, onSelect }: WorkspaceThreadRowProps) {
	const totalTokens = (thread.totalPromptTokens ?? 0) + (thread.totalCompletionTokens ?? 0);
	return (
		<Box
			w="full"
			px="3"
			py="2"
			borderRadius="md"
			cursor="pointer"
			_hover={{ bg: 'var(--wc-bg-hover)' }}
			onClick={() => onSelect(thread.id)}
		>
			<HStack justify="space-between" w="full">
				<Text
					fontSize="13px"
					color="var(--wc-text-primary)"
					overflow="hidden"
					textOverflow="ellipsis"
					whiteSpace="nowrap"
					flex="1"
				>
					{thread.title || 'New Chat'}
				</Text>
				<HStack gap="2" flexShrink={0}>
					{totalTokens > 0 && (
						<Text fontSize="11px" color="var(--wc-text-faint)">
							{(totalTokens / 1000).toFixed(1)}k tokens
						</Text>
					)}
					{(thread.messageCount ?? 0) > 0 && (
						<Text fontSize="11px" color="var(--wc-text-faint)">
							{thread.messageCount} msg
						</Text>
					)}
					<Text fontSize="11px" color="var(--wc-text-disabled)">
						{formatDate(thread.updatedAt)}
					</Text>
				</HStack>
			</HStack>
		</Box>
	);
}

export const WorkspaceView: React.FC<{ folderId: string }> = ({ folderId }) => {
	const folders = useStore(s => s.folders);
	const folder = folders.find(f => f.id === folderId);
	const setWorkspace = useStore(s => s.setWorkspace);
	const threads = useStore(useShallow(s => {
		const threadsArray = Object.values(s.threads) as IChatThread[];
		return threadsArray;
	}));
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);

	const [renaming, setRenaming] = useState(false);
	const [description, setDescription] = useState('');
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Fetch workspace data on mount
	useEffect(() => {
		fetchWorkspace(folderId).then(res => {
			if (res.ok && res.data) {
				setWorkspace(res.data);
				setDescription((res.data.data as any)?.description ?? '');
			}
		});
	}, [folderId, setWorkspace]);

	// Filter and sort threads for this workspace
	const workspaceThreads = useMemo(() => {
		return threads
			.filter(t => t.folderId === folderId)
			.sort((a, b) => b.updatedAt - a.updatedAt);
	}, [threads, folderId]);

	const handleNameSave = async (name: string) => {
		if (name.trim() && name !== folder?.name) {
			await updateFolder(folderId, { name: name.trim() });
		}
		setRenaming(false);
	};

	const handleDescriptionChange = (val: string) => {
		setDescription(val);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			updateWorkspace(folderId, { description: val });
		}, 500);
	};

	const handleThreadSelect = (threadId: string) => {
		setCurrentThreadId(threadId);
	};

	if (!folder) return null;

	return (
		<div className="mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col px-6" style={{ maxWidth: '44rem' }}>
			<VStack align="stretch" gap="4" className="grow" py="8">
				{/* Workspace name */}
				<Box w="full">
					{renaming ? (
						<WorkspaceRenameInput
							value={folder.name}
							onSave={handleNameSave}
							onCancel={() => setRenaming(false)}
						/>
					) : (
						<HStack
							gap="2"
							cursor="pointer"
							onClick={() => setRenaming(true)}
							px="2"
							py="1"
							borderRadius="md"
							_hover={{ bg: 'var(--wc-bg-hover)' }}
						>
							<Text fontSize="24px" fontWeight="600" color="var(--wc-text-heading)">
								{folder.name}
							</Text>
							<PencilIcon size={14} style={{ opacity: 0.3 }} />
						</HStack>
					)}
				</Box>

				{/* Workspace description */}
				<Box w="full">
					<Textarea
						value={description}
						onChange={(e) => handleDescriptionChange(e.target.value)}
						placeholder="Describe this workspace..."
						rows={3}
						bg="var(--wc-bg-card)"
						borderColor="var(--wc-border-default)"
						color="var(--wc-text-primary)"
						borderRadius="md"
						py="3"
						px="3"
						fontSize="14px"
						resize="none"
						_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
					/>
				</Box>

				{/* Thread list */}
				<Box w="full" mt="2">
					<HStack justify="space-between" px="3" py="2">
						<Text fontSize="12px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">
							Threads
						</Text>
						<Text fontSize="11px" color="var(--wc-text-disabled)">
							{workspaceThreads.length}
						</Text>
					</HStack>
					<VStack gap="0" align="stretch" w="full">
						{workspaceThreads.length === 0 && (
							<Text fontSize="12px" color="var(--wc-text-disabled)" px="3" py="4" textAlign="center">
								No threads yet
							</Text>
						)}
						{workspaceThreads.map(thread => (
							<WorkspaceThreadRow
								key={thread.id}
								thread={thread}
								onSelect={handleThreadSelect}
							/>
						))}
					</VStack>
				</Box>
			</VStack>
		</div>
	);
};
