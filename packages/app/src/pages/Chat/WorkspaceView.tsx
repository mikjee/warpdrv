import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Box, Text, HStack, VStack, Input, Textarea, Button, Separator } from '@chakra-ui/react';
import { PencilIcon, CheckIcon, XIcon, FolderInput, ChevronDown, Eye } from 'lucide-react';
import type { IFolder as IChatFolder, IChatThread as IBridgeChatThread } from '@warpcore/bridge';
import { useStore } from '@/store';
import { updateFolder, updateWorkspace, fetchWorkspace, updateFolderTopic } from '@/api/services';
import { useDependantState } from '@/hooks/useDependantState';
import { EServerStatus } from '@warpcore/shared';
import { ServerDot } from '@/components/ServerPicker';

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
	const setFolders = useStore(s => s.setFolders);
	const folder = folders.find(f => f.id === folderId);
	const setWorkspace = useStore(s => s.setWorkspace);
	const setWorkspaceState = useStore(s => s.setWorkspaceState);
	const workspaceProjectRoot = useStore(s => s.workspaceStates[folderId]?.projectRoot as string | undefined);
	const serversMap = useStore(s => s.servers);
	const chatPresets = useStore(s => s.chatPresets);
	const workspaceState = useStore(s => s.workspaceStates[folderId]);
	const defaultServerId = workspaceState?.defaultServerId as string | undefined;
	const defaultPresetId = workspaceState?.defaultPresetId as string | undefined;
	const threads = useStore(useShallow(s => {
		const threadsArray = Object.values(s.threads) as IChatThread[];
		return threadsArray;
	}));
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);

	const [renaming, setRenaming] = useState(false);
	const [serverPickerOpen, setServerPickerOpen] = useState(false);
	const [editingTopic, setEditingTopic] = useState(false);
	const [topic, setTopic] = useDependantState(folder?.topic ?? '');
	const [topicError, setTopicError] = useState<string | null>(null);
	const [description, setDescription] = useState('');
	const [prValue, setPrValue] = useDependantState(workspaceProjectRoot ?? '');
	const prTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
			setFolders(folders.map(f => f.id === folderId ? { ...f, name: name.trim() } : f));
		}
		setRenaming(false);
	};

	const handleTopicSave = async () => {
		const trimmed = topic.trim();
		if (!trimmed) {
			setTopicError('Topic cannot be empty');
			return;
		}
		if (trimmed === 'global') {
			setTopicError('Topic "global" is reserved');
			return;
		}
		const res = await updateFolderTopic(folderId, trimmed);
		if (!res.ok) {
			setTopicError(res.error ?? 'Failed to update topic');
			return;
		}
		setTopicError(null);
		setEditingTopic(false);
	};

	const handleDescriptionChange = (val: string) => {
		setDescription(val);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			updateWorkspace(folderId, { description: val });
		}, 500);
	};

	useEffect(() => {
		setPrValue(workspaceProjectRoot ?? '');
	}, [workspaceProjectRoot, setPrValue]);

	const handleProjectRootChange = (val: string) => {
		setPrValue(val);
		if (prTimerRef.current) clearTimeout(prTimerRef.current);
		prTimerRef.current = setTimeout(() => {
			if (val.trim()) {
				setWorkspaceState(folderId, { projectRoot: val.trim() });
			}
		}, 400);
	};

	const handleBrowseProjectRoot = async () => {
		const selectPath = async (): Promise<string | null> => {
			if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
				const mod = await import('@tauri-apps/plugin-dialog');
				return mod.open({ directory: true, multiple: false }) as Promise<string | null>;
			}
			if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
				const handle = await (window as any).showDirectoryPicker();
				return handle.name;
			}
			return null;
		};
		const path = await selectPath();
		if (path && typeof path === 'string') {
			setPrValue(path);
			setWorkspaceState(folderId, { projectRoot: path });
		}
	};

	const handleThreadSelect = (threadId: string) => {
		setCurrentThreadId(threadId);
	};

	const handleDefaultServerChange = (serverId: string) => {
		setServerPickerOpen(false);
		setWorkspaceState(folderId, { defaultServerId: serverId || null });
	};

	const handleDefaultPresetChange = (presetId: string) => {
		setWorkspaceState(folderId, { defaultPresetId: presetId || null });
	};

	const servers = useMemo(() => Object.values(serversMap).sort((a, b) => {
		const isARunning = a.status === EServerStatus.RUNNING;
		const isBRunning = b.status === EServerStatus.RUNNING;
		if (isARunning && !isBRunning) return -1;
		if (!isARunning && isBRunning) return 1;
		return 0;
	}), [serversMap]);

	const selectedServer = defaultServerId ? serversMap[defaultServerId] : null;

	if (!folder) return null;

	return (
		<div className="mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col px-6" style={{ maxWidth: '44rem' }}>
			<VStack align="stretch" gap="2" className="grow" py="4">
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
							px="0"
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

				{/* Workspace topic */}
				<Box w="full">
					{editingTopic ? (<HStack w="full">
						<Input
							size="sm"
							value={topic}
							onChange={(e) => setTopic(e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') handleTopicSave(); if (e.key === 'Escape') { setEditingTopic(false); setTopicError(null); } }}
							bg="var(--wc-bg-card)"
							borderColor={topicError ? 'var(--wc-accent-red)' : 'var(--wc-border-hover)'}
							color="var(--wc-text-primary)"
							fontFamily="monospace"
							mt="1"
						/>
						<HStack gap="1">
							<Box cursor="pointer" onClick={handleTopicSave} opacity={0.5} _hover={{ opacity: 0.8 }} p="0">
								<CheckIcon size={14} />
							</Box>
							<Box cursor="pointer" onClick={() => { setEditingTopic(false); setTopicError(null); }} opacity={0.3} _hover={{ opacity: 0.6 }} p="1">
								<XIcon size={14} />
							</Box>
						</HStack>
					</HStack>) : (<HStack w="full">
						<Text fontSize="13px" fontFamily="monospace" color="var(--wc-text-tertiary)" mt="1" px="0" py="1">
							#{topic}
						</Text>
						<Box cursor="pointer" onClick={() => { setEditingTopic(true); setTopicError(null); }} opacity={0.3} _hover={{ opacity: 0.6 }}>
							<PencilIcon size={12} />
						</Box>
					</HStack>)}
					{topicError && <Text fontSize="11px" color="var(--wc-accent-red)" mt="1">{topicError}</Text>}
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

				{/* Workspace project root */}
				<Separator w="full" mt="2" mb="4" borderColor="var(--wc-border-subtle)" />
				<Box w="full">
					<Text fontSize="12px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1">
						Project Root
					</Text>
					<HStack gap="2">
						<Input
							size="xs"
							fontSize="12px"
							value={prValue}
							onChange={(e) => handleProjectRootChange(e.target.value)}
							onBlur={() => {
								if (prTimerRef.current) clearTimeout(prTimerRef.current);
								if (prValue.trim()) {
									setWorkspaceState(folderId, { projectRoot: prValue.trim() });
								}
							}}
							placeholder="No project root set"
							fontFamily='"Geist Mono", monospace'
							bg="var(--wc-bg-card)"
							borderColor="var(--wc-border-default)"
							color="var(--wc-text-primary)"
							_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
						/>
						<Button
							size="xs"
							variant="ghost"
							color="var(--wc-text-secondary)"
							_hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }}
							borderRadius="lg"
							minW="8"
							px="0"
							onClick={handleBrowseProjectRoot}
							title="Browse directory"
						>
							<FolderInput size={14} />
						</Button>
					</HStack>
				</Box>

				{/* Default server + preset */}
				<HStack w="full" gap="2" mt="2" mb="2">
					<Box flex="1" position="relative">
						<Text fontSize="12px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1">
							Default Server
						</Text>
						<HStack
							gap="2"
							p="2.5"
							cursor="pointer"
							borderRadius="lg"
							borderWidth="1px"
							borderColor="var(--wc-border-default)"
							_hover={{ bg: 'var(--wc-bg-hover)' }}
							onClick={() => setServerPickerOpen(!serverPickerOpen)}
							fontSize="12px"
							color="var(--wc-text-primary)"
							minW="0"
						>
							{selectedServer ? (
								<>
									<ServerDot status={selectedServer.status} />
									<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
										{selectedServer.serverName}
									</Text>
									{selectedServer.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
									<ChevronDown size={12} style={{ opacity: 0.4 }} />
								</>
							) : (
								<>
									<Text flex="1" color="var(--wc-text-faint)">Select</Text>
									<ChevronDown size={12} style={{ opacity: 0.4 }} />
								</>
							)}
						</HStack>
						{serverPickerOpen && (
							<Box
								position="absolute"
								bottom="100%"
								left="0px"
								mt="2"
								bg="var(--wc-bg-elevated)"
								borderWidth="1px"
								borderColor="var(--wc-border-overlay)"
								borderRadius="md"
								zIndex={50}
								py="1"
								maxH="200px"
								overflowY="auto"
								minW="150px"
							>
								{servers.map((s) => (
									<HStack
										key={s.id}
										gap="2"
										px="3"
										py="2"
										cursor="pointer"
										bg={defaultServerId === s.id ? 'var(--wc-bg-selected)' : 'transparent'}
										_hover={{ bg: 'var(--wc-bg-card)' }}
										onClick={() => handleDefaultServerChange(s.id)}
										fontSize="12px"
										color="var(--wc-text-primary)"
									>
										<ServerDot status={s.status} />
										<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
											{s.serverName}
										</Text>
										{s.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
									</HStack>
								))}
								{servers.length === 0 && (
									<Text px="3" py="2" fontSize="12px" color="var(--wc-text-faint)">No servers</Text>
								)}
							</Box>
						)}
					</Box>
					<Box flex="1">
						<Text fontSize="12px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1">
							Default System Prompt
						</Text>
						<select
							value={defaultPresetId ?? ''}
							onChange={(e) => handleDefaultPresetChange(e.target.value)}
							style={{
								width: '100%',
								background: 'var(--wc-bg-card)',
								border: '1px solid var(--wc-border-default)',
								borderRadius: '6px',
								color: 'var(--wc-text-primary)',
								fontSize: '12px',
								padding: '4px 8px',
								height: '28px',
							}}
						>
							<option value="" style={{ background: 'var(--wc-bg-elevated)' }}>None</option>
							{chatPresets.map((p) => (
								<option key={p.id} value={p.id} style={{ background: 'var(--wc-bg-elevated)' }}>{p.name}</option>
							))}
						</select>
					</Box>
				</HStack>

				<Separator w="full" my="2" borderColor="var(--wc-border-subtle)" />

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
