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
import { ThreadList } from '@/components/assistant-ui/thread-list';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import { updateThreadConfig } from '../api/services';
import type { IServer, IChatPreset, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { EServerStatus, EReasoningEffort } from '@warpcore/shared';
import { EChatRole, EMessagePartType, EToolCallStatus } from '@warpcore/bridge';
import { ChatConfigSidebar, DEFAULT_INFERENCE_PARAMS } from '../components/ChatConfigSidebar';
import '../styles/assistant-ui.css';
import { createContext } from 'react';
import { ChatToolsSidebar } from '../components/ChatToolsSidebar';
import { selectActiveMessages, selectToolCallsForThread } from '@/hooks/useChatSelectors';
import { useThreadConfig } from '@/hooks/useThreadConfig';
import { ToolCallBlockWrapper } from '@/components/assistant-ui/ToolCallBlockWrapper';

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
// Server ID state for completions
let currentServerId: string | null = null;
export function setActiveServerId(id: string | null) {
	currentServerId = id;
}
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
// Helper: Map bridge tool call status to assistant-ui status
// ============================================================
function mapBridgeStatusToAuiStatus(status: EToolCallStatus): 'complete' | 'running' | 'requires-action' | 'error' {
	switch (status) {
		case EToolCallStatus.COMPLETED: return 'complete';
		case EToolCallStatus.EXECUTING: return 'running';
		case EToolCallStatus.PENDING: return 'requires-action';
		case EToolCallStatus.ERROR: return 'error';
		case EToolCallStatus.DENIED: return 'error';
		default: return 'complete';
	}
}

// ============================================================
// ChatInner — main chat layout using bridge store
// ============================================================
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
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Load config when thread changes
	useThreadConfig(currentThreadId);

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

	const chatConfigValue = useMemo(() => ({
		reasoningEffort: currentInferenceParams.reasoningEffort,
		onReasoningEffortChange: (v: EReasoningEffort) => handleParamsChange({ ...currentInferenceParams, reasoningEffort: v }),
		contextSize,
	}), [currentInferenceParams, contextSize]);

	// Get messages and tool calls for current thread
	const messages = currentThreadId ? useStore(s => selectActiveMessages(s, currentThreadId)) : [];
	const toolCalls = currentThreadId ? useStore(s => selectToolCallsForThread(s, currentThreadId)) : [];
	const isRunning = currentThreadId ? useStore(s => s.isRunningByThread[currentThreadId] ?? false) : false;

	// Initial thread load - seed messages and tool calls
	const seedThreadMessages = useStore(s => s.seedThreadMessages);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	useEffect(() => {
		if (!currentThreadId) return;
		
		async function loadThread() {
			// Fetch thread messages
			const res = await fetch(`/api/chat/threads/${currentThreadId ?? ''}`);
			if (res.ok) {
				const data = await res.json();
				seedThreadMessages(currentThreadId as string, data.messages ?? []);
				
				// Fetch tool calls
				const tcRes = await fetch(`/api/chat/threads/${currentThreadId}/tool-calls`);
				if (tcRes.ok) {
					const tcs = await tcRes.json();
					for (const tc of tcs) {
						applyToolCallCreated(tc);
					}
				}
			}
		}
		loadThread();
	}, [currentThreadId, seedThreadMessages, applyToolCallCreated]);

	// Convert bridge messages to assistant-ui format
	const convertMessage = useCallback((msg: any, index: number) => {
		const tcMap = new Map(toolCalls.map(tc => [tc.id, tc]));
		
		// Handle TOOL role - render as assistant with tool-call part containing ToolCallBlockWrapper
		if (msg.role === EChatRole.TOOL) {
			const toolCallId = (msg.content ?? []).find((p: any) => p.type === EMessagePartType.TOOL_CALL)?.toolCallId;
			const tc = toolCallId ? tcMap.get(toolCallId) : undefined;
			
			if (!tc) {
				// Fallback if tool call not found
				return {
					id: msg.id,
					role: 'assistant' as const,
					content: [{ type: 'text' as const, text: '[Tool call not found]' }],
					createdAt: new Date(msg.createdAt),
					status: { type: 'complete' as const, reason: 'stop' as const },
					metadata: { unstable_state: {}, custom: msg.stats || {} },
					attachments: [],
				};
			}
			
			const auiStatus = mapBridgeStatusToAuiStatus(tc.status);
			
			return {
				id: msg.id,
				role: 'assistant' as const, // Render as assistant bubble
				content: [{
					type: 'tool-call' as const,
					toolCallId: tc.id,
					toolName: tc.toolName,
					toolArgs: tc.arguments,
					toolResult: tc.result,
					status: auiStatus,
					toolUI: (
						<ToolCallBlockWrapper 
							toolCallId={tc.id}
							toolName={tc.toolName}
							serverName={tc.serverName}
							args={JSON.parse(tc.arguments)}
							result={tc.result ? JSON.parse(tc.result) : undefined}
							status={auiStatus}
						/>
					),
				}],
				createdAt: new Date(msg.createdAt),
				status: { type: 'complete' as const, reason: 'stop' as const },
				metadata: { unstable_state: {}, custom: msg.stats || {} },
				attachments: [],
			};
		}
		
		const content = (msg.content ?? []).map((part: any) => {
			// Filter out TOOL_CALL parts from assistant messages - they are for API context only
			if (part.type === EMessagePartType.TOOL_CALL) {
				return null;
			}
			if (part.type === EMessagePartType.TEXT) {
				return { type: 'text' as const, text: part.text ?? '' };
			}
			if (part.type === EMessagePartType.REASONING) {
				return { type: 'reasoning' as const, reasoning: part.text ?? '' };
			}
			return { type: 'text' as const, text: '' };
		}).filter(Boolean);

		return {
			id: msg.id,
			role: msg.role as 'user' | 'assistant' | 'system',
			content: content as any,
			createdAt: new Date(msg.createdAt),
			status: { type: 'complete' as const, reason: 'stop' as const },
			metadata: { unstable_state: {}, custom: msg.stats || {} },
			attachments: [],
		};
	}, [toolCalls]);

	const convertedMessages = useMemo(() => {
		return messages.map((msg, idx) => convertMessage(msg, idx));
	}, [messages, convertMessage]);

	// Runtime with external store
	const runtime = useExternalStoreRuntime({
		messages: convertedMessages,
		isRunning,
		onNew: async (message) => {
			if (!currentThreadId || !currentServerId) return;
			const text = (message.content as any[]).filter(p => p.type === 'text').map(p => p.text).join('');
			const lastMsg = messages[messages.length - 1];
			await fetch('/api/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: currentThreadId,
					userMessage: { content: text },
					parentId: lastMsg?.id ?? null,
					serverId: currentServerId,
					messages: [], // Will be built by backend from tree
					systemPrompt: currentSystemPrompt,
					inferenceParams: currentInferenceParams,
				}),
			});
		},
		onReload: async (parentId) => {
			if (!currentThreadId || !currentServerId) return;
			await fetch('/api/chat/completions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					threadId: currentThreadId,
					parentId,
					serverId: currentServerId,
					messages: [],
					systemPrompt: currentSystemPrompt,
					inferenceParams: currentInferenceParams,
				}),
			});
		},
		convertMessage,
	});

	return (
		<ChatConfigContext.Provider value={chatConfigValue}>
			<TooltipProvider>
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
			<AssistantRuntimeProvider runtime={runtime}>
				<Box flex="1" overflow="hidden">
					<Thread />
				</Box>
			</AssistantRuntimeProvider>
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
		</TooltipProvider>
	</ChatConfigContext.Provider>
	);
});
export function ChatPage() {
	const servers = Object.values(useStore((s) => s.servers));
	const setCurrentServerId = useStore(s => s.setCurrentServerId);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = servers.find((s: IServer) => s.id === selectedId);
	const runningServers = servers.filter((s: IServer) => s.status === EServerStatus.RUNNING);
	if (!selectedId && runningServers.length > 0 && runningServers[0]) {
		setSelectedId(runningServers[0].id);
	}
	const activeServerId = (selected && selected.status === EServerStatus.RUNNING) ? selected.id : null;
	setActiveServerId(activeServerId);
	useEffect(() => {
		setCurrentServerId(activeServerId);
	}, [activeServerId, setCurrentServerId]);
	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<PageHeader
				title="Chat"
				subtitle="Talk to your models"
				icon={<MessageSquare size={20} />}
				actions={
					<ServerSelector servers={servers} selectedId={selectedId} onSelect={setSelectedId} />
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