import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { Box, Button, Flex, IconButton, Text, HStack, Popover, Portal, Switch, Slider, VStack, Combobox, createListCollection } from '@chakra-ui/react';
import { MessageSquare, ChevronDown, PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react';
import {
	AssistantRuntimeProvider,
	useExternalStoreRuntime,
	useAuiState,
	type ThreadMessage,
} from '@assistant-ui/react';
import { Thread } from './assistant-ui/thread';
import { ThreadList, useThreadsAndFolders } from './assistant-ui/thread-list';
import { ChatSearchDialog } from './ChatSearchDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import type { AppState } from '../../store/types';
import type { IServer, IChatPreset, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { EServerStatus, EReasoningEffort } from '@warpcore/shared';
import { EChatRole, EMessagePartType, EToolCallStatus, IChatThread, type IChatMessage } from '@warpcore/bridge';
import { DEFAULT_INFERENCE_PARAMS } from './ChatConfigSidebar';
import './assistant-ui/styles/assistant-ui.css';
import { createContext } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { useDerivedMsgsForUI } from '@/hooks/useChatSelectors';
import { useThreadConfig } from '@/hooks/useThreadConfig';
import { useThreadAttachedTools } from '@/hooks/useThreadAttachedTools';
import { useHotkey, HotkeyMode } from '@/hooks/useHotKey';
import { convertMessagesToOpenAIFormat } from '@warpcore/bridge';
import { extractTextFromFile } from '@/hooks/useFileReader';
import { useToast } from '../../components/ToastProvider';
import { updateSettings } from '../../api/services';
import { parseThreadMeta } from '@/pages/Chat/assistant-ui/ServerSelector';
// COMMENTED OUT: per-thread whisper server selection no longer used
// import { parseWhisperThreadMeta } from '@/pages/Chat/assistant-ui/WhisperServerSelector';
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from 'react-icons/vsc';
import { RiFontSize } from 'react-icons/ri';
import mermaid from 'mermaid';

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
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-green-icon)" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-yellow-strong)" flexShrink={0} />;
	if (status === EServerStatus.ERROR) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-red)" flexShrink={0} />;
	return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-text-disabled)" flexShrink={0} />;
}

export const BranchTokensContext = React.createContext(0);

// ============================================================
// ChatInner — main chat layout using bridge store
// ============================================================
const emptyMsgs = {};
const ChatInner = React.memo(({ threadsListCollapsed, onOpenSearch }: { threadsListCollapsed: boolean; onOpenSearch?: () => void }) => {
	const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
	const generateTitle = useStore(s => !s.settings.disableTitleGen);

	const { toast } = useToast();
	const inferenceError = useStore(s => s.inferenceError);
	useEffect(() => {
		if (inferenceError) {
			toast('error', inferenceError.error);
			useStore.setState(s => { s.inferenceError = null; });
		}
	}, [inferenceError, toast]);

	const embeddingError = useStore(s => s.embeddingError);
	useEffect(() => {
		if (embeddingError) {
			toast('error', embeddingError.error);
			useStore.setState(s => { s.embeddingError = null; });
		}
	}, [embeddingError, toast]);

	const theme = useStore(s => s.settings.theme);
	useEffect(() => {
		const styles = getComputedStyle(document.documentElement);
		const get = (v: string) => styles.getPropertyValue(v).trim();
		mermaid.initialize({
			startOnLoad: false,
			securityLevel: 'strict',
			theme: 'base',
			themeVariables: {
				primaryColor: get('--wc-bg-card') || '#1f1f23',
				primaryTextColor: get('--wc-text-primary') || '#dedede',
				primaryBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				lineColor: get('--wc-text-secondary') || 'rgba(255,255,255,0.7)',
				secondaryColor: get('--wc-bg-page') || '#131313',
				tertiaryColor: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				clusterBkg: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				actorBkg: get('--wc-bg-card') || 'rgba(255,255,255,0.02)',
				actorBorder: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				actorTextColor: get('--wc-text-primary') || '#dedede',
				noteBkgColor: get('--wc-bg-card') || 'rgba(255,255,255,0.02)',
				noteBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				noteTextColor: get('--wc-text-primary') || '#dedede',
				activationBorderColor: get('--wc-border-default') || 'rgba(255,255,255,0.08)',
				activationBackgroundColor: get('--wc-bg-subtle') || 'rgba(255,255,255,0.03)',
				sequenceNumberColor: get('--wc-text-muted') || 'rgba(255,255,255,0.4)',
			},
		});
	}, [theme]);

	// Get current thread state from store
	const tempThreadServerId = useStore(s => s.tempThreadServerId);
	const tempAutoEmbed = useStore(s => s.tempAutoEmbed);
	const selectedWhisperServerId = useStore(s => s.selectedWhisperServerId);
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const thread = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);
	const threadServerId = useMemo(() =>
		thread?.meta ? parseThreadMeta(thread.meta).serverId : null,
		[thread]
	);

	// COMMENTED OUT: per-thread whisper server selection no longer used
	// const threadWhisperServerId = useMemo(() =>
	// 	thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
	// 	[thread]
	// );

	const currentServerId = useMemo(() => threadServerId ?? tempThreadServerId, [
		threadServerId,
		tempThreadServerId,
	]);
	const currentAutoEmbed = useMemo(() => {
		if (thread?.meta) {
			try { return JSON.parse(thread.meta).enableAutoEmbed; } catch { /* ignore */ }
		}
		return tempAutoEmbed;
	}, [thread?.meta, tempAutoEmbed]);
	const currentWhisperServerId = selectedWhisperServerId;

	// Check if current server is valid (selected AND running)
	const serversMap = useStore(s => s.servers);
	const currentServer = useMemo(() => currentServerId ? serversMap[currentServerId] : null, [
		currentServerId, 
		serversMap
	]);
	const isValidServer = currentServerId && currentServer?.status === EServerStatus.RUNNING;

	const contextSize = useMemo(() => currentServer?.params?.contextSize ?? 0, [currentServer]);

	// Load config when thread changes
	const {
		handleParamsChange,
		handleSystemPromptChange,
		currentThreadId,
		currentSystemPrompt,
		currentInferenceParams,
	} = useThreadConfig(selectedPresetId);

	// Load attached tools when thread changes
	useThreadAttachedTools();
	const attachAllTools = useStore(s => s.attachAllTools);
	const attachedTools = useStore(s => s.attachedTools);

	// Get threads for adapter
	const threadsAPI = useThreadsAndFolders();

	const handlePresetSelect = useCallback((presetId: string | null, preset: IChatPreset | null) => {
		setSelectedPresetId(presetId);
		if (preset) {
			handleParamsChange(preset.params as unknown as Record<string, unknown>);
			handleSystemPromptChange(preset.systemPrompt);
		} else {
			handleParamsChange({ } as unknown as Record<string, unknown>);
			handleSystemPromptChange('');
		}
	}, [
		handleParamsChange,
		handleSystemPromptChange,
	]);

	const chatConfigValue = useMemo(() => {
		const setBoth = (updates: { reasoningEffort: EReasoningEffort; enableThinking: boolean }) => {
			handleParamsChange({ ...currentInferenceParams, ...updates });
		};
		return {
			reasoningEffort: currentInferenceParams.reasoningEffort,
			onReasoningEffortChange: (v: EReasoningEffort) => setBoth({ reasoningEffort: v, enableThinking: v !== EReasoningEffort.NONE }),
			enableThinking: currentInferenceParams.enableThinking,
			onEnableThinkingChange: (v: boolean) => setBoth({ reasoningEffort: v ? EReasoningEffort.LOW : EReasoningEffort.NONE, enableThinking: v }),
			contextSize,
		};
	}, [currentInferenceParams, contextSize, handleParamsChange]);

// Get head message ID for backend API calls
	const headMessageId = useStore((s: AppState) => s.currentThreadId ? s.headMessageIdByThread[s.currentThreadId]! : null);
	const setHeadMessageId = useStore(s => s.setHeadMessageId);

	// Get messages for UI (all messages, with TOOL messages converted)
	const threadMessages = useStore(s => s.currentThreadId ? s.messagesByThread[s.currentThreadId] || emptyMsgs : emptyMsgs)!;
	const isRunning = useStore(s => s.currentThreadId ? s.isRunningByThread[s.currentThreadId] ?? false : false);
	const {msgRepo, branchTokenCount} = useDerivedMsgsForUI(threadMessages, currentThreadId, headMessageId, isRunning);

	// Check if thread exists in store (distinguishes new vs existing thread)
	const threadInStore = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);

	// Loading state for existing threads
	const [isLoadingThread, setIsLoadingThread] = useState(false);

	// Initial thread load - seed messages and tool calls
	const seedThreadMessages = useStore(s => s.seedThreadMessages);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	const selectedEmbeddingServerId = useStore(s => s.selectedEmbeddingServerId);
	const servers = useStore(s => s.servers);
	const setThreadEmbeddingStatuses = useStore(s => s.setThreadEmbeddingStatuses);
	const clearEmbeddingStatuses = useStore(s => s.clearEmbeddingStatuses);

	// Reload embeddings when selected model changes
	useEffect(() => {
		if (!currentThreadId || !threadInStore) return;
		if (!selectedEmbeddingServerId) {
			clearEmbeddingStatuses();
			return;
		}
		fetch(`/api/chat/threads/${currentThreadId}/embeddings?serverId=${encodeURIComponent(selectedEmbeddingServerId)}`)
			.then(res => res.ok ? res.json() : null)
			.then(data => {
				if (data) setThreadEmbeddingStatuses(data.data?.messageIds ?? []);
				else clearEmbeddingStatuses();
			})
			.catch(() => clearEmbeddingStatuses());
	}, [currentThreadId, selectedEmbeddingServerId]);
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

				// Fetch embedding statuses
				if (selectedEmbeddingServerId) {
					const embRes = await fetch(`/api/chat/threads/${currentThreadId}/embeddings?serverId=${encodeURIComponent(selectedEmbeddingServerId)}`);
					if (embRes.ok) {
						const { data: embData } = await embRes.json();
						setThreadEmbeddingStatuses(embData?.messageIds ?? []);
					}
				}
			}
			setIsLoadingThread(false);
		}
		loadThread();
	}, [currentThreadId, threadInStore, threadMessages, selectedEmbeddingServerId, servers, seedThreadMessages, applyToolCallCreated, setThreadEmbeddingStatuses]);

	// V2: no message chain sent to backend — backend builds from persistence
	const onNewV2 = useCallback(async (message: any) => {
		if (!isValidServer) return;
		const text = (message.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('');

		// Generate new thread ID if none exists - orchestrator will auto-create the thread
		const threadId = currentThreadId ?? globalThis.crypto.randomUUID();
		if (!currentThreadId) {
			setCurrentThreadId(threadId);
		}

		// Process attachments - convert File objects to base64
		const attachments = message.attachments || [];
		const attachmentParts: any[] = [];

		for (const att of attachments) {
			if (att.file instanceof File) {
				const isImage = att.file.type.startsWith('image/');
				if (isImage) {
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
				} else {
					let extractedText = '';
					try {
						extractedText = await extractTextFromFile(att.file);
					} catch (err) {
						console.error('[onNewV2] failed to extract text from', att.file.name, err);
					}
					if (extractedText) {
						attachmentParts.push({
							id: att.id || crypto.randomUUID(),
							type: 'attachment',
							orderIndex: 0,
							data: '',
							mimeType: att.file.type || 'application/octet-stream',
							fileName: att.file.name,
							fileSize: att.file.size,
							extractedText,
						});
					}
				}
			} else if (att.content) {
				const imagePart = att.content.find((p: any) => p.type === 'image');
				if (imagePart) {
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
			whisperServerId: currentWhisperServerId,
			enableAutoEmbed: currentAutoEmbed,
			systemPrompt: currentSystemPrompt,
			inferenceParams: currentInferenceParams,
			presetId: selectedPresetId,
			generateTitle,
			attachAllTools,
			attachedTools: attachAllTools ? undefined : attachedTools,
		};

		if (attachmentParts.length > 0) {
			body.attachments = attachmentParts;
		}

		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});
	}, [currentThreadId, headMessageId, currentSystemPrompt, currentInferenceParams, setCurrentThreadId, currentServerId, currentWhisperServerId, currentAutoEmbed, isValidServer, attachAllTools, attachedTools]);

	const onReloadV2 = useCallback(async (parentId: string | null) => {
		if (!isValidServer || !parentId) return;
		if (!currentThreadId) return;

		await fetch('/api/chat/completions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				threadId: currentThreadId,
				parentId,
				serverId: currentServerId,
				whisperServerId: currentWhisperServerId,
				enableAutoEmbed: currentAutoEmbed,
				systemPrompt: currentSystemPrompt,
				inferenceParams: currentInferenceParams,
				presetId: selectedPresetId,
				generateTitle,
				attachAllTools,
				attachedTools: attachAllTools ? undefined : attachedTools,
			}),
		});
	}, [currentThreadId, currentSystemPrompt, currentInferenceParams, currentServerId, currentWhisperServerId, currentAutoEmbed, isValidServer, attachAllTools, attachedTools]);

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
		onNew: onNewV2,
		onEdit,
		onReload: onReloadV2,
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
				threads: Object.values(threadsAPI.threads).map((t: any) => ({ ...t, status: 'regular' as const })),
				threadId: currentThreadId ?? undefined,
			},
			attachments: attachmentAdapter,
		},
	});

	return (
		<ChatConfigContext.Provider value={chatConfigValue}>
			<TooltipProvider>
				<AssistantRuntimeProvider runtime={runtime}>
				<Flex flex="1" h="100%" overflow="hidden" className="dark" style={{ background: "var(--wc-bg-page)" }}>
						{!threadsListCollapsed && (
						<Box
							w="300px"
							minW="300px"
							borderRightWidth="1px"
							borderColor="var(--wc-border-subtle)"
							h="full"
							py="3"
							display="flex"
							flexDirection="column"
						>
							<Flex flex="1" flexDirection="column" overflow="hidden" gap="3">
								<ThreadList onOpenSearch={onOpenSearch} />
							</Flex>
						</Box>
						)}
						<Box flex="1" overflow="hidden">
							<BranchTokensContext value={branchTokenCount}>
								<Thread isLoading={isLoadingThread} currentServerId={currentServerId} />
							</BranchTokensContext>
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

	const title = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId]?.title || "New Chat" : "New Chat");
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);
	const currentThreadId = useStore(s => s.currentThreadId);
	const [threadsListCollapsed, setThreadsListCollapsed] = useState(false);
	const [searchOpen, setSearchOpen] = useState(false);
	const openChatSidebarTab = useStore(s => s.openChatSidebarTab);
	const chatPageRef = useRef<HTMLDivElement>(null);

	useHotkey(
		{
			keys: { ControlLeft: true, KeyF: true },
			mode: HotkeyMode.KEYPRESS,
			target: chatPageRef,
		},
		{
			onActivate: () => {
				openChatSidebarTab('search');
				setTimeout(() => {
					const input = document.querySelector('#chat-page [placeholder="Search in thread..."]') as HTMLInputElement | null;
					input?.focus();
				}, 50);
			},
		}
	);

	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	const chatFixedWidth = useStore(s => s.settings.chatFixedWidth ?? false);

	const fontFamilyCollection = createListCollection({
		items: [
			{ label: 'Inter', value: 'Inter Variable, sans-serif' },
			{ label: 'Geist', value: '"Geist", sans-serif' },
			{ label: 'Geist Mono', value: '"Geist Mono", monospace' },
			{ label: 'Arial', value: 'Arial, sans-serif' },
			{ label: 'Verdana', value: 'Verdana, sans-serif' },
			{ label: 'Georgia', value: 'Georgia, serif' },
			{ label: 'Times New Roman', value: '"Times New Roman", serif' },
			{ label: 'Courier New', value: '"Courier New", monospace' },
		],
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});

	return (
		<Flex ref={chatPageRef} id="chat-page" direction="column" h="100%" overflow="hidden">
			<PageHeader
				title="Chat"
				icon={<MessageSquare size={20} />}
				actionsRight={
					<Popover.Root>
						<Popover.Trigger asChild>
							<IconButton
								aria-label="Chat settings"
								variant="ghost"
								size="md"
								borderWidth="1px"
								borderColor="var(--wc-border-default)"
								borderRadius="lg"
								color="var(--wc-text-secondary)"
								_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-active)' }}
							>
								<RiFontSize size={20} />
							</IconButton>
						</Popover.Trigger>
						<Portal>
							<Popover.Positioner>
								<Popover.Content
									w="260px"
									bg="var(--wc-bg-elevated)"
									borderWidth="1px"
									borderColor="var(--wc-border-default)"
									borderRadius="lg"
									shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
								>
									<Popover.Arrow>
										<Popover.ArrowTip bg="var(--wc-bg-elevated)" borderColor="var(--wc-border-default)" />
									</Popover.Arrow>
									<Popover.Body p="3">
										<VStack align="stretch" gap="3">
											<Text fontSize="12px" fontWeight="600" color="var(--wc-text-heading)">Chat Appearance</Text>

											<VStack align="stretch" gap="2">
												<HStack justify="space-between">
													<Text fontSize="11px" color="var(--wc-text-muted)">Font Size</Text>
													<Text fontSize="11px" color="var(--wc-text-tertiary)">{chatFontSize}px</Text>
												</HStack>
												<Slider.Root
													w="full"
													size="sm"
													colorPalette="blue"
													value={[chatFontSize]}
													min={10}
													max={32}
													onValueChange={(details) => updateSettings({ chatFontSize: details.value[0] })}
												>
													<Slider.Control>
														<Slider.Track>
															<Slider.Range />
														</Slider.Track>
														<Slider.Thumbs />
													</Slider.Control>
												</Slider.Root>
											</VStack>

											<VStack align="stretch" gap="2">
												<Text fontSize="11px" color="var(--wc-text-muted)">Font Family</Text>
												<Combobox.Root
													collection={fontFamilyCollection}
													value={[chatFontFamily || '']}
													onValueChange={(details) => updateSettings({ chatFontFamily: details.value?.[0] || '' })}
												>
													<Combobox.Control>
														<Combobox.Trigger asChild>
															<Button
																variant="outline"
																size="sm"
																justifyContent="space-between"
																bg="var(--wc-bg-card)"
																borderColor="var(--wc-border-default)"
																color="var(--wc-text-primary)"
																fontSize="12px"
																borderRadius="md"
																fontWeight="500"
															>
																{chatFontFamily ? (fontFamilyCollection.items.find(i => i.value === chatFontFamily)?.label || 'Default (Inter)') : 'Default (Inter)'}
																<ChevronDown size={12} />
															</Button>
														</Combobox.Trigger>
													</Combobox.Control>
													<Portal>
														<Combobox.Positioner>
															<Combobox.Content
																bg="var(--wc-bg-elevated)"
																borderWidth="1px"
																borderColor="var(--wc-border-default)"
																borderRadius="md"
																shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
																p="1"
																maxH="200px"
																overflowY="auto"
															>
																<Combobox.Item item={{ label: 'Default (Inter)', value: '' }} px="2" py="1.5" borderRadius="sm" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
																	<Text fontSize="11px" color="var(--wc-text-primary)">Default (Inter)</Text>
																	<Combobox.ItemIndicator />
																</Combobox.Item>
																{fontFamilyCollection.items.map((item) => (
																	<Combobox.Item key={item.value} item={item} px="2" py="1.5" borderRadius="sm" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
																		<Text fontSize="11px" color="var(--wc-text-primary)">{item.label}</Text>
																		<Combobox.ItemIndicator />
																	</Combobox.Item>
																))}
															</Combobox.Content>
														</Combobox.Positioner>
													</Portal>
												</Combobox.Root>
											</VStack>

											<Switch.Root label="Fixed chat width" checked={chatFixedWidth} onCheckedChange={(details) => updateSettings({ chatFixedWidth: details.checked })}>
												<Switch.HiddenInput />
												<Switch.Control css={{ bg: chatFixedWidth ? 'var(--wc-accent-blue)' : 'surface.4' }}>
													<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
												</Switch.Control>
												<Switch.Label ml="2" fontSize="12px" color={chatFixedWidth ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} userSelect="none">
													Fixed width
												</Switch.Label>
											</Switch.Root>
										</VStack>
									</Popover.Body>
								</Popover.Content>
							</Popover.Positioner>
						</Portal>
					</Popover.Root>
				}
				actions={
					<>
						<IconButton
							aria-label="Toggle threads list"
							variant="ghost"
							size="sm"
							mr="5"
							color="var(--wc-text-secondary)"
							_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-active)' }}
								onClick={() => setThreadsListCollapsed(!threadsListCollapsed)}
						>
							{threadsListCollapsed ? <VscLayoutSidebarLeftOff size={20} /> : <VscLayoutSidebarLeft size={20} />}
						</IconButton>
						<Button
							size="sm"
							bg="var(--wc-accent-blue-bg-12)"
							color="var(--wc-accent-blue)"
							borderWidth="1px"
							borderColor="var(--wc-accent-blue-border)"
							_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="500"
							onClick={() => setCurrentThreadId(globalThis.crypto.randomUUID())}
						>
							<Plus size={15} />
							New Chat
						</Button>
						<span style={{
							fontSize: "13px",
							color: "var(--wc-text-muted)",
							position: "fixed",
							left: `calc(50% - (${title.length * 3.5}px - ${threadsListCollapsed ? "-20" : "100"}px)`
						}}>{title}</span>
					</>
				}
			/>
			<Flex flex="1" overflow="hidden" pt="60px">
				<Flex flex="1" overflow="hidden">
					<ChatInner threadsListCollapsed={threadsListCollapsed} onOpenSearch={() => setSearchOpen(true)} />
				</Flex>
			</Flex>
			<ChatSearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} currentThreadId={currentThreadId} />
		</Flex>
	);
});