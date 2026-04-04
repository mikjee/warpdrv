import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Flex, Text, HStack } from '@chakra-ui/react';
import { MessageSquare, ChevronDown } from 'lucide-react';
import {
	AssistantRuntimeProvider,
	useLocalRuntime,
	useRemoteThreadListRuntime,
	useAui,
	useAuiState,
	RuntimeAdapterProvider,
	type ChatModelAdapter,
	type RemoteThreadListAdapter,
	type ThreadHistoryAdapter,
} from '@assistant-ui/react';
import { createAssistantStream } from 'assistant-stream';
import { Thread } from '@/components/assistant-ui/thread';
import { ThreadList } from '@/components/assistant-ui/thread-list';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import {
	fetchThreads,
	createThread,
	fetchThread,
	updateThread,
	deleteThread,
	appendMessages,
	fetchThreadConfig,
	updateThreadConfig,
} from '../api/services';
import type { IServer, IChatPreset, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { EServerStatus, EChatRole, EResponseFormat, EReasoningFormat, EReasoningEffort } from '@warpcore/shared';
import { ChatConfigSidebar, DEFAULT_INFERENCE_PARAMS } from '../components/ChatConfigSidebar';
import '../styles/assistant-ui.css';
import { createContext, useContext } from 'react';
import { ChatToolsSidebar } from '../components/ChatToolsSidebar';
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
// Model adapter — routes through backend /api/chat/completions
// ============================================================
let currentServerId: string | null = null;
export function setActiveServerId(id: string | null) {
	currentServerId = id;
}

let activeInferenceParams: IChatInferenceParams = { ...DEFAULT_INFERENCE_PARAMS };
let activeSystemPrompt: string = '';
let activeThreadId: string | null = null;

export function setActiveThreadId(id: string | null) {
	activeThreadId = id;
}

const modelAdapter: ChatModelAdapter = {
	async *run({ messages, abortSignal }) {
		if (!currentServerId) {
			yield { content: [{ type: 'text' as const, text: 'No server selected. Pick a running server from the dropdown above.' }] };
			return;
		}

		const convertedMessages = messages.map((m) => {
			const textParts = m.content.filter((p: any) => p.type === 'text');
			const text = textParts.map((p: any) => (p as any).text).join('');
			return { role: m.role as 'system' | 'user' | 'assistant', content: text };
		});

		const body = {
			threadId: activeThreadId ?? '',
			serverId: currentServerId,
			messages: convertedMessages,
			systemPrompt: activeSystemPrompt || undefined,
			inferenceParams: activeInferenceParams,
		};

		const response = await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal: abortSignal,
		});

		if (!response.ok || !response.body) {
			yield { content: [{ type: 'text' as const, text: `Error: ${response.status} ${response.statusText}` }] };
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let fullText = '';
		let reasoningText = '';
		let buffer = '';
		let timings: any = null;
		let usage: any = null;

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.startsWith('data: ')) continue;
				const data = line.slice(6).trim();
				if (data === '[DONE]') continue;
				if (!data) continue;

				try {
					const parsed = JSON.parse(data);

					// WarpCore extension events
					if (parsed.warpcore_event) {
						if (parsed.warpcore_event === 'tool_call_pending') {
							const tcInfo = `\n\n> **Tool call pending approval:** ${parsed.tool_name} (${parsed.server_name})\n`;
							fullText += tcInfo;
							const content: any[] = [];
							if (reasoningText) content.push({ type: 'reasoning' as const, reasoning: reasoningText });
							content.push({ type: 'text' as const, text: fullText });
							yield { content };
						} else if (parsed.warpcore_event === 'tool_call_result') {
							const statusLabel = parsed.status === 'COMPLETED' ? 'completed' : parsed.status === 'DENIED' ? 'denied' : 'error';
							const trInfo = `\n> **Tool result** (${statusLabel}): ${parsed.result}\n`;
							fullText += trInfo;
							const content: any[] = [];
							if (reasoningText) content.push({ type: 'reasoning' as const, reasoning: reasoningText });
							content.push({ type: 'text' as const, text: fullText });
							yield { content };
						} else if (parsed.warpcore_event === 'error') {
							yield { content: [{ type: 'text' as const, text: `Error: ${parsed.error}` }] };
							return;
						}
						continue;
					}

					const delta = parsed.choices?.[0]?.delta;
					const finishReason = parsed.choices?.[0]?.finish_reason;

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						const content: any[] = [];
						if (reasoningText) content.push({ type: 'reasoning' as const, reasoning: reasoningText });
						if (fullText) content.push({ type: 'text' as const, text: fullText });
						if (content.length > 0) yield { content };
					}

					if (delta?.content) {
						fullText += delta.content;
						const content: any[] = [];
						if (reasoningText) content.push({ type: 'reasoning' as const, reasoning: reasoningText });
						content.push({ type: 'text' as const, text: fullText });
						yield { content };
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							const tcInfo = `\n\n> **Tool call:** ${tc.function?.name ?? 'unknown'}\n\`\`\`json\n${tc.function?.arguments ?? '{}'}\n\`\`\`\n`;
							fullText += tcInfo;
							const content: any[] = [];
							if (reasoningText) content.push({ type: 'reasoning' as const, reasoning: reasoningText });
							content.push({ type: 'text' as const, text: fullText });
							yield { content };
						}
					}

					if (parsed.timings) timings = parsed.timings;
					if (parsed.usage) usage = parsed.usage;

				} catch { /* skip malformed */ }
			}
		}

		const finalContent: any[] = [];
		if (reasoningText) finalContent.push({ type: 'reasoning' as const, reasoning: reasoningText });
		finalContent.push({ type: 'text' as const, text: fullText });

		const ppSpeed = timings?.prompt_per_second ?? 0;
		const tgSpeed = timings?.predicted_per_second ?? 0;
		const promptTokens = usage?.prompt_tokens ?? timings?.prompt_n ?? 0;
		const completionTokens = usage?.completion_tokens ?? timings?.predicted_n ?? 0;
		const reasoningTokens = usage?.reasoning_tokens ?? 0;
		const ppMs = timings?.prompt_ms ?? 0;
		const tgMs = timings?.predicted_ms ?? 0;

		yield {
			content: finalContent,
			metadata: {
				unstable_state: {},
				custom: {
					promptTokens,
					completionTokens,
					reasoningTokens,
					ppSpeed: Math.round(ppSpeed * 100) / 100,
					tgSpeed: Math.round(tgSpeed * 100) / 100,
					ttftMs: Math.round(ppMs),
					totalMs: Math.round(ppMs + tgMs),
				},
				timing: {
					streamStartTime: 0,
					firstTokenTime: undefined,
					totalStreamTime: ppMs + tgMs,
					tokenCount: completionTokens,
					tokensPerSecond: Math.round(tgSpeed * 100) / 100,
					totalChunks: 0,
					toolCallCount: 0,
				},
			},
		};
	},
};
// ============================================================
// Thread list adapter — talks to our SQLite backend
// ============================================================
const threadListAdapter: RemoteThreadListAdapter = {
	async list() {
		const res = await fetchThreads();
		if (!res.ok) return { threads: [] };
		return {
			threads: res.data.map((t) => ({
				remoteId: t.id,
				externalId: undefined,
				status: 'regular' as const,
				title: t.title,
			})),
		};
	},
	async initialize(threadId) {
		return { remoteId: threadId, externalId: undefined };
	},
	async rename(remoteId, newTitle) {
		await updateThread(remoteId, { title: newTitle });
	},
	async archive(remoteId) {
		await deleteThread(remoteId);
	},
	async unarchive(_remoteId) {
		// not implemented
	},
	async delete(remoteId) {
		await deleteThread(remoteId);
	},
	async fetch(remoteId) {
		const res = await fetchThread(remoteId);
		if (!res.ok) return { remoteId, status: 'regular' as const, title: undefined };
		return {
			remoteId: res.data.id,
			status: 'regular' as const,
			title: res.data.title,
		};
	},
	async generateTitle(_remoteId, unstable_messages) {
		const firstUserMsg = unstable_messages.find((m) => m.role === 'user');
		let title = 'New Chat';
		if (firstUserMsg) {
			const textPart = firstUserMsg.content.find((p: any) => p.type === 'text');
			if (textPart && 'text' in textPart) {
				title = (textPart as any).text.slice(0, 50);
				if ((textPart as any).text.length > 50) title += '...';
			}
		}
		await updateThread(_remoteId, { title });
		return createAssistantStream((controller) => {
			controller.appendText(title);
			controller.close();
		});
	},
};
// ============================================================
// History provider — injects per-thread history adapter
// ============================================================
function HistoryProvider({ children }: { children: ReactNode }) {
	const aui = useAui();
	const history = useMemo<ThreadHistoryAdapter>(() => ({
		async load() {
			const { remoteId } = await aui.threadListItem().initialize();
			if (!remoteId) return { messages: [] };
			const res = await fetchThread(remoteId);
			if (!res.ok || !res.data) return { messages: [] };
			const msgs = (res.data as any).messages ?? [];
			return {
				messages: msgs.map((m: any, idx: number) => ({
					parentId: idx === 0 ? null : msgs[idx - 1].id,
					message: {
						id: m.id,
						role: m.role as 'user' | 'assistant' | 'system',
						content: [{ type: 'text' as const, text: m.content }],
						createdAt: new Date(m.createdAt),
						status: { type: 'complete' as const },
						metadata: { unstable_state: {}, custom: m.stats ? JSON.parse(m.stats) : {} },
						attachments: [],
					},
				})),
			};
		},
		async append(item) {
			const { remoteId } = await aui.threadListItem().initialize();
			if (!remoteId) return;
			const existing = await fetchThread(remoteId);
			if (!existing.ok || !existing.data) {
				await createThread({ id: remoteId, title: 'New Chat' });
			}
			const msg = item.message;
			const textParts = msg.content.filter((p: any) => p.type === 'text');
			const content = textParts.map((p: any) => (p as any).text).join('');
			if (!content) return;
			const stats = (msg.metadata as any)?.custom ?? null;
			await appendMessages(remoteId, [{
				role: msg.role as EChatRole,
				content,
				stats: stats ? JSON.stringify(stats) : undefined,
			}]);
		},
	}), [aui]);
	return (
		<RuntimeAdapterProvider adapters={{ history }}>
			{children}
		</RuntimeAdapterProvider>
	);
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
// ConfigManager — lives inside AssistantRuntimeProvider
// Uses useAuiState to reactively detect thread switches
// ============================================================
function ConfigManager({
	onConfigLoaded,
}: {
	onConfigLoaded: (threadId: string, config: { presetId: string | null; systemPrompt: string; params: IChatInferenceParams }) => void;
}) {
	const threadId = useAuiState((s) => s.threadListItem?.remoteId);
	const lastLoadedRef = useRef<string | null>(null);
	useEffect(() => {
		if (!threadId) return;
		if (threadId === lastLoadedRef.current) return;
		lastLoadedRef.current = threadId;
		setActiveThreadId(threadId);
		fetchThreadConfig(threadId).then((res) => {
			if (res.ok && res.data) {
				const config = res.data as IThreadConfig;
				let params = DEFAULT_INFERENCE_PARAMS;
				try {
					const parsed = typeof config.params === 'string' ? JSON.parse(config.params) : config.params;
					params = { ...DEFAULT_INFERENCE_PARAMS, ...parsed };
				} catch { /* use defaults */ }
				onConfigLoaded(threadId, {
					presetId: config.presetId,
					systemPrompt: config.systemPrompt,
					params,
				});
			} else {
				onConfigLoaded(threadId, {
					presetId: null,
					systemPrompt: '',
					params: { ...DEFAULT_INFERENCE_PARAMS },
				});
			}
		});
	}, [threadId, onConfigLoaded]);
	return null;
}
// ============================================================
// ChatInner — main chat layout
// ============================================================
const ChatInner = React.memo(({ contextSize }: { contextSize: number }) => {
	const [configOpen, setConfigOpen] = useState(false);
	const [toolsOpen, setToolsOpen] = useState(false);
	const [inferenceParams, setInferenceParams] = useState<IChatInferenceParams>({ ...DEFAULT_INFERENCE_PARAMS });
	const [systemPrompt, setSystemPrompt] = useState('');
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	// Refs for debounced save — avoids stale closures
	const currentThreadIdRef = useRef<string | null>(null);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isLoadingRef = useRef(false);
	// Sync module-level vars so the model adapter can read them
	useEffect(() => { activeInferenceParams = inferenceParams; }, [inferenceParams]);
	useEffect(() => { activeSystemPrompt = systemPrompt; }, [systemPrompt]);
	// Called by ConfigManager when active thread changes
	const handleConfigLoaded = useCallback((threadId: string, config: { presetId: string | null; systemPrompt: string; params: IChatInferenceParams }) => {
		// Cancel any pending save for the previous thread
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		isLoadingRef.current = true;
		currentThreadIdRef.current = threadId;
		setSelectedPresetId(config.presetId);
		setSystemPrompt(config.systemPrompt);
		setInferenceParams(config.params);
		// Re-enable saves after React finishes this batch of state updates
		requestAnimationFrame(() => { isLoadingRef.current = false; });
	}, []);
	// Save to backend — all values passed as args, nothing from closures
	function doSave(tid: string, params: IChatInferenceParams, prompt: string, presetId: string | null) {
		updateThreadConfig(tid, {
			presetId: presetId,
			systemPrompt: prompt,
			params: JSON.stringify(params),
		});
	}
	function scheduleSave(newParams: IChatInferenceParams, newPrompt: string, newPresetId: string | null) {
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		const tid = currentThreadIdRef.current;
		if (!tid || isLoadingRef.current) return;
		saveTimerRef.current = setTimeout(() => doSave(tid, newParams, newPrompt, newPresetId), 400);
	}
	function handleParamsChange(newParams: IChatInferenceParams) {
		setInferenceParams(newParams);
		scheduleSave(newParams, systemPrompt, selectedPresetId);
	}
	function handleSystemPromptChange(newPrompt: string) {
		setSystemPrompt(newPrompt);
		scheduleSave(inferenceParams, newPrompt, selectedPresetId);
	}
	function handlePresetSelect(presetId: string | null, preset: IChatPreset | null) {
		setSelectedPresetId(presetId);
		if (preset) {
			setInferenceParams(preset.params);
			setSystemPrompt(preset.systemPrompt);
			scheduleSave(preset.params, preset.systemPrompt, presetId);
		} else {
			scheduleSave(inferenceParams, systemPrompt, null);
		}
	}
	const runtime = useRemoteThreadListRuntime({
		runtimeHook: () => useLocalRuntime(modelAdapter),
		adapter: {
			...threadListAdapter,
			unstable_Provider: HistoryProvider,
		},
	});
	const chatConfigValue = useMemo(() => ({
		reasoningEffort: inferenceParams.reasoningEffort,
		onReasoningEffortChange: (v: EReasoningEffort) => handleParamsChange({ ...inferenceParams, reasoningEffort: v }),
		contextSize,
	}), [inferenceParams, contextSize]);
	return (
		<ChatConfigContext.Provider value={chatConfigValue}>
		<AssistantRuntimeProvider runtime={runtime}>
			<ConfigManager onConfigLoaded={handleConfigLoaded} />
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
					<Box flex="1" overflow="hidden">
						<Thread />
					</Box>
					<ChatConfigSidebar
						open={configOpen}
						onToggle={() => setConfigOpen(!configOpen)}
						params={inferenceParams}
						systemPrompt={systemPrompt}
						selectedPresetId={selectedPresetId}
						onParamsChange={handleParamsChange}
						onSystemPromptChange={handleSystemPromptChange}
						onPresetSelect={handlePresetSelect}
					/>
					<ChatToolsSidebar open={toolsOpen} onToggle={() => setToolsOpen(!toolsOpen)} />
				</Flex>
			</TooltipProvider>
		</AssistantRuntimeProvider>
		</ChatConfigContext.Provider>
	);
});
export function ChatPage() {
	const servers = Object.values(useStore((s) => s.servers));
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const selected = servers.find((s: IServer) => s.id === selectedId);
	const runningServers = servers.filter((s: IServer) => s.status === EServerStatus.RUNNING);
	if (!selectedId && runningServers.length > 0 && runningServers[0]) {
		setSelectedId(runningServers[0].id);
	}
	const activeServerId = (selected && selected.status === EServerStatus.RUNNING) ? selected.id : null;
	setActiveServerId(activeServerId);
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