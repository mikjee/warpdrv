import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Box, Flex, Text, HStack } from '@chakra-ui/react';
import { MessageSquare, ChevronDown } from 'lucide-react';
import {
	AssistantRuntimeProvider,
	useLocalRuntime,
	useRemoteThreadListRuntime,
	useAui,
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
} from '../api/services';
import type { IServer } from '@warpcore/shared';
import { EServerStatus, EChatRole } from '@warpcore/shared';
import '../styles/assistant-ui.css';

// ============================================================
// Model adapter — direct to llama-server, no proxy
// ============================================================

let currentPort: number | null = null;

export function setActivePort(port: number | null) {
	currentPort = port;
}

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

		const result = streamText({
			model: provider.chat('model'),
			messages: convertedMessages,
			abortSignal,
		});

		let fullText = '';
		for await (const chunk of (await result).textStream) {
			fullText += chunk;
			yield { content: [{ type: 'text' as const, text: fullText }] };
		}
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
			// Convert to ExportedMessageRepository format
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

function ChatInner() {
	const runtime = useRemoteThreadListRuntime({
		runtimeHook: () => useLocalRuntime(modelAdapter),
		adapter: {
			...threadListAdapter,
			unstable_Provider: HistoryProvider,
		},
	});

	return (
		<AssistantRuntimeProvider runtime={runtime}>
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