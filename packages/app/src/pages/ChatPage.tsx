import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Flex, Text, HStack } from '@chakra-ui/react';
import { MessageSquare, ChevronDown } from 'lucide-react';
import {
	AssistantRuntimeProvider,
	useExternalStoreRuntime,
	useAuiState,
	type ThreadMessage,
} from '@assistant-ui/react';
import { Thread } from '@/components/assistant-ui/thread';
import { ThreadList, useThreadsAndFolders } from '@/components/assistant-ui/thread-list';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import type { AppState } from '../store/types';
import { updateThreadConfig, fetchSettings } from '../api/services';
import type { IServer, IChatPreset, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { EServerStatus, EReasoningEffort } from '@warpcore/shared';
import { EChatRole, EMessagePartType, EToolCallStatus, type IChatMessage } from '@warpcore/bridge';
import { ChatConfigSidebar, DEFAULT_INFERENCE_PARAMS } from '../components/ChatConfigSidebar';
import '../styles/assistant-ui.css';
import { createContext } from 'react';
import { ChatToolsSidebar } from '../components/ChatToolsSidebar';
import { ChatSidebar } from '../components/ChatSidebar';
import { buildMessageChain, selectToolCallsForThread, useDerivedMsgsForUI } from '@/hooks/useChatSelectors';
import { useThreadConfig } from '@/hooks/useThreadConfig';
import { ToolCallBlockWrapper } from '@/components/assistant-ui/ToolCallBlockWrapper';
import { useShallow } from 'zustand/shallow';
import { convertMessagesToOpenAIFormat } from '@warpcore/bridge';
import { useToast } from '../components/ToastProvider';

const getFileDataURL = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});

const attachmentAdapter = {
	accept: '*',
	add: async ({ file }: { file: File }) => ({
		id: file.name + '-' + Date.now(),
		type: file.type.startsWith('image/') ? 'image' : 'document',
		name: file.name,
		contentType: file.type,
		file,
		status: { type: 'requires-action' as const, reason: 'composer-send' as const },
	}),
	remove: async () => {},
	send: async (att: any) => {
		const dataUrl = await getFileDataURL(att.file);
		return {
			...att,
			status: { type: 'complete' as const },
			content: [{ type: 'image', image: dataUrl }],
		};
	},
};

interface IChatConfig {
	reasoningEffort: EReasoningEffort;
	onReasoningEffortChange: (v: EReasoningEffort) => void;
	enableThinking: boolean;
	onEnableThinkingChange: (v: boolean) => void;
	contextSize: number;
}
export const ChatConfigContext = createContext<IChatConfig>({
	reasoningEffort: EReasoningEffort.NONE,
	onReasoningEffortChange: () => {},
	enableThinking: false,
	onEnableThinkingChange: () => {},
	contextSize: 0,
});
// ============================================================
// UI Components
// ============================================================
function ServerDot({ status }: { status: EServerStatus }) {
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="#22c55e" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="#f59e0b" flexShrink={0} />;
	if (status === EServerStatus.ERROR) return <Box w="8px" h="8px" borderRadius="full" bg="#ef4444" flexShrink={0} />;
	return <Box w="8px" h="8px" borderRadius="full" bg="rgba(255,255,255,0.15)" flexShrink={0} />;
}
function ServerSelector({
	servers,
	selectedId,
	onSelect,
}: {
	servers: IServer[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = servers.find((s) => s.id === selectedId);
	return (
		<Box position="relative" style={{ left: "calc(400px - 50vw)" }}>
			<HStack
				gap="2"
				px="3"
				py="1.5"
				cursor="pointer"
				borderRadius="md"
				borderWidth="1px"
				borderColor="rgba(255,255,255,0.08)"
				bg="rgba(255,255,255,0.03)"
				_hover={{ bg: 'rgba(255,255,255,0.05)' }}
				onClick={() => setOpen(!open)}
				fontSize="13px"
				color="rgba(255,255,255,0.7)"
				minW="500px"
			>
				{selected ? (
					<>
						<ServerDot status={selected.status} />
						<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="13px">
							{selected.serverName}
						</Text>
						<Text fontFamily="mono" fontSize="11px" color="rgba(255,255,255,0.35)">:{selected.port}</Text>
					</>
				) : (
					<Text flex="1" color="rgba(255,255,255,0.35)" fontSize="13px">Select server...</Text>
				)}
				<ChevronDown size={14} style={{ opacity: 0.4 }} />
			</HStack>
			{open && (
				<Box
					position="absolute"
					top="100%"
					left="0"
					right="0"
					mt="1"
					bg="#1a1a1a"
					borderWidth="1px"
					borderColor="rgba(255,255,255,0.1)"
					borderRadius="md"
					zIndex={50}
					py="1"
					maxH="300px"
					overflowY="auto"
				>
					{servers.map((s) => (
						<HStack
							key={s.id}
							gap="2"
							px="3"
							py="2"
							cursor="pointer"
							bg={selectedId === s.id ? 'rgba(255,255,255,0.06)' : 'transparent'}
							_hover={{ bg: 'rgba(255,255,255,0.04)' }}
							onClick={() => { onSelect(s.id); setOpen(false); }}
							fontSize="13px"
							color="rgba(255,255,255,0.7)"
						>
							<ServerDot status={s.status} />
							<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
								{s.serverName}
							</Text>
							<Text fontFamily="mono" fontSize="11px" color="rgba(255,255,255,0.35)">:{s.port}</Text>
						</HStack>
					))}
					{servers.length === 0 && (
						<Text px="3" py="2" fontSize="12px" color="rgba(255,255,255,0.3)">No servers configured</Text>
					)}
				</Box>
			)}
		</Box>
	);
}


// ============================================================
// ChatInner — main chat layout using bridge store
// ============================================================
const emptyMsgs = {};
const ChatInner = React.memo(({ contextSize }: { contextSize: number }) => {
	// Removed: const [configOpen, setConfigOpen] = useState(false);
	// Removed: const [toolsOpen, setToolsOpen] = useState(false);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const [generateTitle, setGenerateTitle] = useState(true);

	useEffect(() => {
		fetchSettings().then(r => {
			if (r.ok && r.data) setGenerateTitle(r.data.disabledTitleGen !== true);
		});
	}, []);

	const { toast } = useToast();
	const inferenceError = useStore(s => s.inferenceError);
	useEffect(() => {
		if (inferenceError) {
			toast('error', inferenceError.error);
			useStore.setState(s => { s.inferenceError = null; });
		}
	}, [inferenceError, toast]);

	// Get current thread state from store
	const currentThreadId = useStore(s => s.currentThreadId);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams as unknown as IChatInferenceParams);
	const currentServerId = useStore(s => s.currentServerId);

	// Actions
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Check if current server is valid (selected AND running)
	const serversMap = useStore(s => s.servers);
	const currentServer = serversMap[currentServerId || ''] || null;
	const isValidServer = currentServerId && currentServer?.status === EServerStatus.RUNNING;

	// Load config when thread changes
	const {
		handleParamsChange,
		handleSystemPromptChange,
	} = useThreadConfig(selectedPresetId);

	// Get threads for adapter
	const threadsAPI = useThreadsAndFolders();

	function handlePresetSelect(presetId: string | null, preset: IChatPreset | null) {
		setSelectedPresetId(presetId);
		if (preset) {
			setCurrentInferenceParams(preset.params as unknown as Record<string, unknown>);
			setCurrentSystemPrompt(preset.systemPrompt);
		} else {
			setCurrentInferenceParams({ ...DEFAULT_INFERENCE_PARAMS } as unknown as Record<string, unknown>);
			setCurrentSystemPrompt('');
		}
	}

	const chatConfigValue = useMemo(() => {
		const setBoth = (updates: { reasoningEffort: EReasoningEffort; enableThinking: boolean }) => {
			setCurrentInferenceParams({ ...currentInferenceParams, ...updates });
		};
		return {
			reasoningEffort: currentInferenceParams.reasoningEffort,
			onReasoningEffortChange: (v: EReasoningEffort) => setBoth({ reasoningEffort: v, enableThinking: v !== EReasoningEffort.NONE }),
			enableThinking: currentInferenceParams.enableThinking,
			onEnableThinkingChange: (v: boolean) => setBoth({ reasoningEffort: v ? EReasoningEffort.HIGH : EReasoningEffort.NONE, enableThinking: v }),
			contextSize,
		};
	}, [currentInferenceParams, contextSize, setCurrentInferenceParams]);

// Get head message ID for backend API calls
	const headMessageId = useStore((s: AppState) => s.currentThreadId ? s.headMessageIdByThread[s.currentThreadId]! : null);
	const setHeadMessageId = useStore(s => s.setHeadMessageId);

	// Get messages for UI (all messages, with TOOL messages converted)
	const threadMessages = useStore(s => s.currentThreadId ? s.messagesByThread[s.currentThreadId] || emptyMsgs : emptyMsgs)!;
	const isRunning = useStore(s => s.currentThreadId ? s.isRunningByThread[s.currentThreadId] ?? false : false);
	const msgRepo = useDerivedMsgsForUI(threadMessages, currentThreadId, headMessageId, isRunning);
	const toolCallsById = useStore(s => s.toolCallsById);

	// Check if thread exists in store (distinguishes new vs existing thread)
	const threadInStore = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);

	// Loading state for existing threads
	const [isLoadingThread, setIsLoadingThread] = useState(false);

	// Initial thread load - seed messages and tool calls
	const seedThreadMessages = useStore(s => s.seedThreadMessages);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	useEffect(() => {
		if (!currentThreadId) {
			setIsLoadingThread(false);
			return;
		}
		
		// New thread (not in store) - don't fetch, don't show loading
		if (!threadInStore) {
			setIsLoadingThread(false);
			return;
		}
		
		if (threadMessages !== emptyMsgs) {
			setIsLoadingThread(false);
			return;
		}

		// Existing thread - fetch and show loading
		setIsLoadingThread(true);
		
		async function loadThread() {
			const res = await fetch(`/api/chat/threads/${currentThreadId ?? ''}`);
			if (res.ok) {
				const response = await res.json();
				const data = response.data;
				seedThreadMessages(currentThreadId as string, data?.messages ?? []);
				
				// Fetch tool calls
				const tcRes = await fetch(`/api/mcp/tool-calls/thread/${currentThreadId}`);
				if (tcRes.ok) {
					const { data: tcs } = await tcRes.json();
					for (const tc of tcs) {
						applyToolCallCreated(tc);
					}
				}
			}
			setIsLoadingThread(false);
		}
		loadThread();
	}, [currentThreadId, threadInStore, threadMessages]);

	// Runtime callbacks
	const onNew = useCallback(async (message: any) => {
		if (!isValidServer) return;
		const text = (message.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
		
		// Generate new thread ID if none exists - orchestrator will auto-create the thread
		const threadId = currentThreadId ?? globalThis.crypto.randomUUID();
		if (!currentThreadId) {
			setCurrentThreadId(threadId);
		}
		
		// Build messages from head for backend (includes TOOL messages)
		const messagesForBackend = buildMessageChain(
			useStore.getState(),
			threadId,
			{ includeToolMessages: true }
		);
		const openAIMessages = convertMessagesToOpenAIFormat(messagesForBackend, toolCallsById);
		
		// Process attachments - convert File objects to base64
		const attachments = message.attachments || [];
		const attachmentParts: any[] = [];
		
		for (const att of attachments) {
			if (att.file instanceof File) {
				// Read file as base64
				const base64 = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result as string);
					reader.onerror = reject;
					reader.readAsDataURL(att.file);
				});
				
				attachmentParts.push({
					id: att.id || crypto.randomUUID(),
					type: 'attachment',
					orderIndex: 0,
					data: base64,
					mimeType: att.file.type || 'application/octet-stream',
					fileName: att.file.name,
					fileSize: att.file.size,
				});
			} else if (att.content) {
				// Already converted attachment
				const imagePart = att.content.find((p: any) => p.type === 'image');
				if (imagePart) {
					// Strip data: prefix — adapter encodes as base64 data URL
					const base64 = imagePart.image.startsWith('data:')
						? imagePart.image.split(',')[1]
						: imagePart.image;
					attachmentParts.push({
						id: att.id || crypto.randomUUID(),
						type: 'attachment',
						orderIndex: 0,
						data: base64,
						mimeType: att.contentType || 'image/*',
						fileName: att.name,
						fileSize: 0,
					});
				}
			}
		}
		
		const body: any = {
			threadId,
			userMessage: { content: text },
			parentId: headMessageId,
			serverId: currentServerId,
			messages: openAIMessages,
			systemPrompt: currentSystemPrompt,
			inferenceParams: currentInferenceParams,
			generateTitle,
		};
		
		if (attachmentParts.length > 0) {
			body.attachments = attachmentParts;
		}
		
		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	}, [currentThreadId, headMessageId, currentSystemPrompt, currentInferenceParams, setCurrentThreadId, toolCallsById, currentServerId]);

	const onReload = useCallback(async (parentId: string | null) => {
		if (!isValidServer || !parentId) return;
		
		// Build messages from the regen point (parentId), not from head
		// Messages below parentId should not be included
		if (!currentThreadId) return;
		const messagesFromParent = buildMessageChain(
			useStore.getState(),
			currentThreadId,
			{ includeToolMessages: true, fromId: parentId }
		);
		
		const openAIMessages = convertMessagesToOpenAIFormat(messagesFromParent, toolCallsById);
		
		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				threadId: currentThreadId,
				parentId,
				serverId: currentServerId,
				messages: openAIMessages,
				systemPrompt: currentSystemPrompt,
				inferenceParams: currentInferenceParams,
				generateTitle,
			}),
		});
	}, [currentThreadId, currentSystemPrompt, currentInferenceParams, toolCallsById, currentServerId]);

	const onCancel = useCallback(async () => {
		if (currentThreadId && isValidServer) {
			await fetch(`/api/chat/cancel/${currentThreadId}`, { method: 'POST' });
		}
	}, [currentThreadId, isValidServer]);

	const onEdit = useCallback(async (message: any) => {
		if (!currentThreadId) return;
		
		// AppendMessage has sourceId (the edited message ID), not id
		const messageId = message?.sourceId;
		if (!messageId) {
			console.error('[onEdit] No sourceId found in:', message);
			return;
		}
		
		const text = (message.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');
		
		const parts = [{
			id: globalThis.crypto.randomUUID(),
			type: 'text' as const,
			orderIndex: 0,
			text,
		}];
		
		await fetch(`/api/chat/messages/${messageId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ parts }),
		});
	}, [currentThreadId]);

	const runtime = useExternalStoreRuntime<ThreadMessage>({
		messageRepository: msgRepo,
		isRunning,
		onNew,
		onEdit,
		onReload,
		onCancel,
		// Called by assistant-ui when messages update (including branch switches)
		setMessages: (newMessages: any) => {
			// Extract the last message ID from the new messages
			const lastMessage = newMessages[newMessages.length - 1] as any;
			if (currentThreadId && lastMessage && !isRunning) {
				// Map assistant-ui message ID back to our store's message ID
				const ourMessageId = lastMessage.id;
				setHeadMessageId(currentThreadId, ourMessageId);
			}
		},
		adapters: {
			threadList: {
				onSwitchToNewThread: async () => {
					const newThreadId = globalThis.crypto.randomUUID();
					setCurrentThreadId(newThreadId);
				},
				onSwitchToThread: async (threadId: string) => {
					setCurrentThreadId(threadId);
				},
				threads: Object.values(threadsAPI.threads).map(t => ({ ...t, status: 'regular' as const })),
				threadId: currentThreadId ?? undefined,
			},
			attachments: attachmentAdapter,
		},
	});

	return (
		<ChatConfigContext.Provider value={chatConfigValue}>
			<TooltipProvider>
				<AssistantRuntimeProvider runtime={runtime}>
					<Flex flex="1" h="100%" overflow="hidden" className="dark">
						<Box
							w="260px"
							minW="260px"
							borderRightWidth="1px"
							borderColor="rgba(255,255,255,0.06)"
							h="full"
							p="3"
							display="flex"
							flexDirection="column"
						>
							<Flex flex="1" flexDirection="column" overflow="hidden" gap="3">
								<ThreadList />
							</Flex>
						</Box>
						<Box flex="1" overflow="hidden">
							<Thread isLoading={isLoadingThread} />
						</Box>
						{/* New unified sidebar with tabs */}
					<ChatSidebar
						configParams={currentInferenceParams}
						configSystemPrompt={currentSystemPrompt}
						configSelectedPresetId={selectedPresetId}
						onConfigParamsChange={handleParamsChange}
						onConfigSystemPromptChange={handleSystemPromptChange}
						onConfigPresetSelect={handlePresetSelect}
					/>
					</Flex>
				</AssistantRuntimeProvider>
			</TooltipProvider>
		</ChatConfigContext.Provider>
	);
});
export const ChatPage = React.memo(() => {
	const serversMap = useStore(s => s.servers);
	const serversArray = useMemo(() => Object.values(serversMap), [serversMap]);
	const currentServerId = useStore(s => s.currentServerId);
	const setCurrentServerId = useStore(s => s.setCurrentServerId);
	const selected = serversArray.find((s: IServer) => s.id === currentServerId);
	
	// Auto-select first running server if none selected
	useEffect(() => {
		if (!currentServerId) {
			const runningServers = Object.values(serversMap).filter(s => s.status === EServerStatus.RUNNING);
			if (runningServers.length > 0) {
				const firstRunning = runningServers[0];
				if (firstRunning) {
					setCurrentServerId(firstRunning.id);
				}
			}
		}
	}, [serversMap, currentServerId, setCurrentServerId]);
	
	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<PageHeader
				title="Chat"
				subtitle="Talk to your models"
				icon={<MessageSquare size={20} />}
				actions={
					<ServerSelector servers={serversArray} selectedId={currentServerId} onSelect={setCurrentServerId} />
				}
			/>
			<Flex flex="1" overflow="hidden">
				<Flex flex="1" overflow="hidden">
					<ChatInner contextSize={selected?.params?.contextSize ?? 0} />
				</Flex>			
			</Flex>
		</Flex>
	);
});