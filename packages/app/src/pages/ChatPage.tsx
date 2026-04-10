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
import { updateThreadConfig } from '../api/services';
import type { IServer, IChatPreset, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { EServerStatus, EReasoningEffort } from '@warpcore/shared';
import { EChatRole, EMessagePartType, EToolCallStatus, type IChatMessage } from '@warpcore/bridge';
import { ChatConfigSidebar, DEFAULT_INFERENCE_PARAMS } from '../components/ChatConfigSidebar';
import '../styles/assistant-ui.css';
import { createContext } from 'react';
import { ChatToolsSidebar } from '../components/ChatToolsSidebar';
import { buildMessageChain, selectToolCallsForThread, useDerivedMsgsForUI } from '@/hooks/useChatSelectors';
import { useThreadConfig } from '@/hooks/useThreadConfig';
import { ToolCallBlockWrapper } from '@/components/assistant-ui/ToolCallBlockWrapper';
import { useShallow } from 'zustand/shallow';
import { convertMessagesToOpenAIFormat } from '@warpcore/bridge';

interface IChatConfig {
	reasoningEffort: EReasoningEffort;
	onReasoningEffortChange: (v: EReasoningEffort) => void;
	contextSize: number;
}
export const ChatConfigContext = createContext<IChatConfig>({
	reasoningEffort: EReasoningEffort.NONE,
	onReasoningEffortChange: () => {},
	contextSize: 0,
});
// ============================================================
// UI Components
// ============================================================
function ServerDot({ status }: { status: EServerStatus }) {
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="#22c55e" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="#f59e0b" flexShrink={0} />;
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
	const [configOpen, setConfigOpen] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

	// Get current thread state from store
	const currentThreadId = useStore(s => s.currentThreadId);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams as unknown as IChatInferenceParams);
	const currentServerId = useStore(s => s.currentServerId);

	// Actions
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Load config when thread changes
	useThreadConfig(currentThreadId);

	// Get threads for adapter
	const threadsAPI = useThreadsAndFolders();

	// Debounced save
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	function handleParamsChange(newParams: IChatInferenceParams) {
		setCurrentInferenceParams(newParams as unknown as Record<string, unknown>);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		if (currentThreadId) {
			saveTimerRef.current = setTimeout(() => {
				updateThreadConfig(currentThreadId, {
					presetId: selectedPresetId,
					systemPrompt: currentSystemPrompt,
					params: JSON.stringify(newParams),
				});
			}, 400);
		}
	}

	function handleSystemPromptChange(newPrompt: string) {
		setCurrentSystemPrompt(newPrompt);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		if (currentThreadId) {
			saveTimerRef.current = setTimeout(() => {
				updateThreadConfig(currentThreadId, {
					presetId: selectedPresetId,
					systemPrompt: newPrompt,
					params: JSON.stringify(currentInferenceParams as unknown as Record<string, unknown>),
				});
			}, 400);
		}
	}

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
		return {
			reasoningEffort: currentInferenceParams.reasoningEffort,
			onReasoningEffortChange: (v: EReasoningEffort) => {
				setCurrentInferenceParams({ ...currentInferenceParams, reasoningEffort: v });
			},
			contextSize,
		};
	}, [currentInferenceParams, contextSize, setCurrentInferenceParams]);

// Get head message ID for backend API calls
	const headMessageId = useStore((s: AppState) => s.currentThreadId ? s.headMessageIdByThread[s.currentThreadId]! : null);
	const setHeadMessageId = useStore(s => s.setHeadMessageId);

	// Get messages for UI (active branch only, with TOOL messages converted)
	const threadMessages = useStore(s => s.currentThreadId ? s.messagesByThread[s.currentThreadId] || emptyMsgs : emptyMsgs)!;
	const messages = useDerivedMsgsForUI(threadMessages, headMessageId);
	const isRunning = useStore(s => s.currentThreadId ? s.isRunningByThread[s.currentThreadId] ?? false : false);
	const toolCallsById = useStore(s => s.toolCallsById);

	// Check if thread exists in store (distinguishes new vs existing thread)
	const threadInStore = useStore(s => currentThreadId ? s.threads[currentThreadId] : undefined);

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
	}, [currentThreadId, threadInStore]);

	// Convert bridge messages to assistant-ui format
	const convertMessage = useCallback((msg: any, index: number) => {
		
		// Use toolCallsById from closure (already reactive via useStore)
		const threadToolCalls = Object.values(toolCallsById).filter((tc: any) => tc.threadId === currentThreadId);
		const tcMap = new Map(threadToolCalls.map((tc: any) => [tc.id, tc]));
		
		const content = (msg.content ?? []).map((part: any) => {
			// Convert TOOL_CALL parts to tool-call format
			if (part.type === EMessagePartType.TOOL_CALL) {
				const tc = tcMap.get(part.toolCallId);
				if (tc) {
					return {
						type: 'tool-call' as const,
						toolCallId: tc.id,
						toolName: tc.toolName,
						args: JSON.parse(tc.arguments),
						argsText: tc.arguments,
						result: tc.result ? JSON.parse(tc.result) : undefined,
						serverName: tc.serverName,
					};
				}
				return null;
			}
			if (part.type === EMessagePartType.TEXT) {
				return { type: 'text' as const, text: part.text || '' };
			}
			if (part.type === EMessagePartType.REASONING) {
				const reasoningText = part.text || '';
				return { type: 'reasoning' as const, reasoning: reasoningText, text: reasoningText };
			}
			return { type: 'text' as const, text: '' };
		}).filter(Boolean);

		const isAssistant = msg.role === EChatRole.ASSISTANT;

		// Check if this assistant message has any pending tool calls
		const hasPendingToolCalls = isAssistant && content.some(
			(part: any) => part.type === 'tool-call' && 
						   part.toolCallId && 
						   tcMap.get(part.toolCallId)?.status === EToolCallStatus.PENDING
		);

		const result: any = {
			id: msg.id,
			role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
			content: content as any,
			createdAt: new Date(msg.createdAt),
			metadata: { unstable_state: {}, custom: msg.stats || {} },
			attachments: [],
		};

		// Set message status based on whether there are pending tool calls
		if (isAssistant) {
			result.status = hasPendingToolCalls 
				? { type: 'requires-action' as const, reason: 'tool-calls' as const }
				: { type: 'complete' as const, reason: 'stop' as const };
		}

		return result;
	}, [currentThreadId, toolCallsById]);

	const convertedMessages = useMemo(() => {
		return messages.map((msg, idx) => convertMessage(msg, idx));
	}, [messages, convertMessage]);

	// Runtime callbacks
	const onNew = useCallback(async (message: any) => {
		if (!currentServerId) return;
		const text = (message.content as any[]).filter(p => p.type === 'text').map(p => p.text).join('');
		
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
		
		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				threadId,
				userMessage: { content: text },
				parentId: headMessageId,
				serverId: currentServerId,
				messages: openAIMessages,
				systemPrompt: currentSystemPrompt,
				inferenceParams: currentInferenceParams,
			}),
		});
	}, [currentThreadId, currentServerId, headMessageId, currentSystemPrompt, currentInferenceParams, setCurrentThreadId, toolCallsById]);

	const onReload = useCallback(async (parentId: string | null) => {
		if (!currentThreadId || !currentServerId || !parentId) return;
		
		// Build messages from the regen point (parentId), not from head
		// Messages below parentId should not be included
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
			}),
		});
	}, [currentThreadId, currentServerId, currentSystemPrompt, currentInferenceParams, toolCallsById]);

	const onCancel = useCallback(async () => {
		if (currentThreadId) {
			await fetch(`/api/chat/cancel/${currentThreadId}`, { method: 'POST' });
		}
	}, [currentThreadId]);

	const runtime = useExternalStoreRuntime({
		messages: convertedMessages,
		isRunning,
		onNew,
		onReload,
		onCancel,
		// Called by assistant-ui when messages update (including branch switches)
		setMessages: (newMessages) => {
			// Extract the last message ID from the new messages
			const lastMessage = newMessages[newMessages.length - 1];
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
							overflow="auto"
							p="3"
						>
							<ThreadList />
						</Box>
						<Box flex="1" overflow="hidden">
							<Thread isLoading={isLoadingThread} />
						</Box>
						<ChatConfigSidebar
							open={configOpen}
							onToggle={() => setConfigOpen(!configOpen)}
							params={currentInferenceParams}
							systemPrompt={currentSystemPrompt}
							selectedPresetId={selectedPresetId}
							onParamsChange={handleParamsChange}
							onSystemPromptChange={handleSystemPromptChange}
							onPresetSelect={handlePresetSelect}
						/>
						<ChatToolsSidebar open={toolsOpen} onToggle={() => setToolsOpen(!toolsOpen)} />
					</Flex>
				</AssistantRuntimeProvider>
			</TooltipProvider>
		</ChatConfigContext.Provider>
	);
});
export function ChatPage() {
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
}