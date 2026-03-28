import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { Thread } from '@/components/assistant-ui/thread';
import { ThreadList } from '@/components/assistant-ui/thread-list';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '../components/PageHeader';
import { useListQuery } from '../hooks/useQuery';
import {
	fetchServers,
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
import { EServerStatus, EChatRole, EResponseFormat, EReasoningFormat } from '@warpcore/shared';
import { ChatConfigSidebar, DEFAULT_INFERENCE_PARAMS } from '../components/ChatConfigSidebar';
import '../styles/assistant-ui.css';

// ============================================================
// Model adapter — direct to llama-server, no proxy
// ============================================================

let currentPort: number | null = null;

export function setActivePort(port: number | null) {
	currentPort = port;
}

let activeInferenceParams: IChatInferenceParams = { ...DEFAULT_INFERENCE_PARAMS };
let activeSystemPrompt: string = '';

const modelAdapter: ChatModelAdapter = {
	async *run({ messages, abortSignal }) {
		if (!currentPort) {
			yield { content: [{ type: 'text' as const, text: 'No server selected. Pick a running server from the dropdown above.' }] };
			return;
		}
		const provider = createOpenAI({
			baseURL: `http://localhost:${currentPort}/v1`,
			apiKey: 'warpcore',
		});

		const convertedMessages = messages.map((m) => {
			const textParts = m.content.filter((p: any) => p.type === 'text');
			const text = textParts.map((p: any) => (p as any).text).join('');
			return { role: m.role as 'system' | 'user' | 'assistant', content: text };
		});

		const p = activeInferenceParams;
		const allMessages = activeSystemPrompt
			? [{ role: 'system' as const, content: activeSystemPrompt }, ...convertedMessages]
			: convertedMessages;
		const result = streamText({
			model: provider.chat('model'),
			messages: allMessages,
			abortSignal,
			temperature: p.temperature,
			topP: p.topP,
			topK: p.topK,
			maxOutputTokens: p.maxTokens > 0 ? p.maxTokens : undefined,
			frequencyPenalty: p.frequencyPenalty,
			presencePenalty: p.presencePenalty,
			seed: p.seed >= 0 ? p.seed : undefined,
			providerOptions: {
				openai: {
					...(p.repeatPenalty !== 1.0 ? { repeat_penalty: p.repeatPenalty } : {}),
					...(p.minP > 0 ? { min_p: p.minP } : {}),
					...(p.mirostatMode > 0 ? { mirostat: p.mirostatMode, mirostat_tau: p.mirostatTau, mirostat_eta: p.mirostatEta } : {}),
					...(p.cachePrompt ? { cache_prompt: true } : {}),
					...(p.responseFormat !== EResponseFormat.TEXT ? { response_format: { type: p.responseFormat } } : {}),
					...(p.reasoningFormat !== EReasoningFormat.NONE ? { reasoning_format: p.reasoningFormat } : {}),
					...(p.enableThinking ? { chat_template_kwargs: { enable_thinking: true } } : {}),
				},
			},
		});
		let fullText = '';
		const genStart = performance.now();
		let firstChunkTime: number | null = null;
		for await (const chunk of (await result).textStream) {
			if (firstChunkTime === null) firstChunkTime = performance.now();
			fullText += chunk;
			yield { content: [{ type: 'text' as const, text: fullText }] };
		}
		const genEnd = performance.now();
		const usage = await (await result).usage;
		const completionTokens = usage?.outputTokens ?? 0;
		const promptTokens = usage?.inputTokens ?? 0;
		const totalStreamTime = genEnd - genStart;
		const tokensPerSecond = (completionTokens > 0 && firstChunkTime)
			? Math.round((completionTokens / (genEnd - firstChunkTime)) * 1000 * 100) / 100
			: 0;
		yield {
			content: [{ type: 'text' as const, text: fullText }],
			metadata: {
				unstable_state: {},
				custom: {
					promptTokens,
					completionTokens,
					promptPerSecond: (firstChunkTime && promptTokens > 0)
						? Math.round((promptTokens / (firstChunkTime - genStart)) * 1000 * 100) / 100
						: 0,
				},
				timing: {
					streamStartTime: genStart,
					firstTokenTime: firstChunkTime ?? undefined,
					totalStreamTime,
					tokenCount: completionTokens,
					tokensPerSecond,
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
						metadata: { unstable_state: {}, custom: {} },
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
			await appendMessages(remoteId, [{
				role: msg.role as EChatRole,
				content,
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
		<Box position="relative">
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
				minW="200px"
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

function ChatInner() {
	const [configOpen, setConfigOpen] = useState(false);
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

	return (
		<AssistantRuntimeProvider runtime={runtime}>
			<ConfigManager onConfigLoaded={handleConfigLoaded} />
			<TooltipProvider>
				<Flex flex="1" h="100%" overflow="hidden" className="dark">
					<Box
						w="260px"
						minW="260px"
						borderRightWidth="1px"
						borderColor="rgba(255,255,255,0.06)"
						bg="rgba(0,0,0,0.15)"
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
				</Flex>
			</TooltipProvider>
		</AssistantRuntimeProvider>
	);
}

export function ChatPage() {
	const fetcher = useCallback(() => fetchServers(), []);
	const { data: servers } = useListQuery<IServer>(fetcher, { pollInterval: 5000 });
	const [selectedId, setSelectedId] = useState<string | null>(null);

	const selected = servers.find((s) => s.id === selectedId);
	const runningServers = servers.filter((s) => s.status === EServerStatus.RUNNING);

	if (!selectedId && runningServers.length > 0 && runningServers[0]) {
		setSelectedId(runningServers[0].id);
	}

	const activePort = (selected && selected.status === EServerStatus.RUNNING) ? selected.port : null;
	setActivePort(activePort);

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
				<ChatInner />
			</Flex>
		</Flex>
	);
}