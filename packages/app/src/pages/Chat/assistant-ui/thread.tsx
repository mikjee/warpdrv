import {
	ComposerAddAttachment,
	ComposerAttachments,
	UserMessageAttachments,
} from "./attachment";
import { MarkdownText } from "./markdown-text";
import { ToolFallback } from "./tool-fallback";
import { ToolCallBlockWrapper } from "./ToolCallBlockWrapper";
import { TooltipIconButton } from "./tooltip-icon-button";
import { KokoroTTSButton } from "./KokoroTTS";
import { EmbeddingToggle } from "./EmbeddingToggle";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { VscTools } from "react-icons/vsc";
import { LuDatabaseZap } from "react-icons/lu";
import { Box, Image, Popover, Switch, AccordionRoot, AccordionItem as AccordionItemComp, AccordionItemTrigger, AccordionItemContent, HStack, VStack, Text } from '@chakra-ui/react';
import {
	ActionBarMorePrimitive,
	ActionBarPrimitive,
	AuiIf,
	BranchPickerPrimitive,
	ChainOfThoughtPrimitive,
	ComposerPrimitive,
	ErrorPrimitive,
	MessagePrimitive,
	SuggestionPrimitive,
	ThreadPrimitive,
	useAuiState, useAui, useAuiEvent,
} from "@assistant-ui/react";
import {
	ArrowDownIcon,
	ArrowUpIcon,
	BrainCircuit,
	CheckIcon,
	ChevronDownIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	CopyIcon,
	DownloadIcon,
	Info,
	MoreHorizontalIcon,
	PencilIcon,
	RefreshCwIcon,
	SendHorizonal,
	Wrench,
	SquareIcon,
	Timer,
	Trash2,
	Volume2,
} from "lucide-react";
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState, type FC } from "react";
import { BranchTokensContext, ChatConfigContext } from "@/pages/Chat/ChatPage";
import { useStore } from "@/store";
import { VoiceWaveform } from "./VoiceWaveform";
import { TTSFlameWaveform } from "./TTSFlameWaveform";
import { ThreadServerSelector } from "@/pages/Chat/assistant-ui/ServerSelector";
import { ThreadWhisperServerSelector } from "@/pages/Chat/assistant-ui/WhisperServerSelector";
import { VoiceInput } from "@/pages/Chat/assistant-ui/VoiceInput";
import { deleteMessage } from "@/api/services";
import { useMessageTiming } from "@assistant-ui/react";
import { BrainCircuitIcon, ClockIcon } from "lucide-react";
import { EReasoningEffort, EServerStatus, TServerId } from "@warpcore/shared";
import { EMcpServerStatus, IToolAttachment } from "@warpcore/bridge";
import { encodingForModel } from 'js-tiktoken';
import { IconButton } from '@chakra-ui/react';
import { Elicitation } from './Elicitation';
import { AnnotationsBox } from './AnnotationsBox';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SelectionPopover } from './SelectionPopover';
import { DictationProvider, useDictation } from './DictationContext';
import { WorkspaceView } from '../WorkspaceView';
import { ComposerEditor, IWarpComposerEditorRef } from './ComposerEditor';
import { insertComposerText, clearComposerEditor } from './composerEditorRegistry';
import { ComposerUiSpace } from '../ComposerUiSpace';

const tokenEncoder = encodingForModel('gpt-4o');

interface DeleteMessageState {
	messageId: string | null;
	isLoading: boolean;
	open: (messageId: string) => void;
	close: () => void;
	confirm: () => Promise<void>;
}
const DeleteMessageContext = React.createContext<DeleteMessageState | null>(null);

interface IServerStatusContext {
	currentServerId: string | null;
	currentServerStatus: EServerStatus | null;
	isValidServer: boolean;
	supportsMultiModal: boolean;
}

export const ServerStatusContext = React.createContext<IServerStatusContext>({
	currentServerId: null,
	currentServerStatus: null,
	isValidServer: false,
	supportsMultiModal: false,
});

export const Thread: FC<{
	isLoading?: boolean,
	currentServerId: TServerId | null
}> = React.memo(({ isLoading = false, currentServerId }) => {
	const ThreadMsgFn = useCallback(() => <ThreadMessage />, []);
	const serversMap = useStore(s => s.servers);
	const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
	const [deletingLoading, setDeletingLoading] = useState(false);

	const currentServer = useMemo(() => currentServerId ? serversMap[currentServerId] || null : null, [
		currentServerId,
		serversMap
	]);
	const currentServerStatus = currentServer?.status || null;
	const isValidServer = !!currentServerId && currentServer?.status === EServerStatus.RUNNING;
	const supportsMultiModal = currentServer?.useMultiModal ?? false;
	const chatFixedWidth = useStore(s => s.settings.chatFixedWidth ?? false);

	const deleteMessageCtx = useMemo<DeleteMessageState>(() => {
		let resolveFn: (() => void) | null = null;
		const handleConfirm = async () => {
			setDeletingLoading(true);
			try {
				await deleteMessage(deletingMessageId!);
			} finally {
				setDeletingLoading(false);
				setDeletingMessageId(null);
				if (resolveFn) resolveFn();
			}
		};
		return {
			messageId: deletingMessageId,
			isLoading: deletingLoading,
			open: (messageId: string) => setDeletingMessageId(messageId),
			close: () => setDeletingMessageId(null),
			confirm: handleConfirm,
		};
	}, [deletingMessageId, deletingLoading]);

	return (
		<ServerStatusContext.Provider value={{ currentServerId, currentServerStatus, isValidServer, supportsMultiModal }}>
			<DeleteMessageContext.Provider value={deleteMessageCtx}>
				<DictationProvider>
					<ThreadPrimitive.Root
					className="aui-root aui-thread-root @container flex h-full flex-col"
					style={{
						["--thread-max-width" as string]: "44rem",
						["--composer-radius" as string]: "24px",
						["--composer-padding" as string]: "10px",
					}}
				>
					<ThreadPrimitive.Viewport
						turnAnchor="bottom"
						autoScroll={false}
						className="aui-thread-viewport relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll px-6 pt-4"
						style={{ overflowAnchor: "none" }}
					>
						{isLoading ? (
							<div className="flex h-full items-center justify-center">
								<div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
							</div>
						) : (
							<>
								<AuiIf condition={(s) => s.thread.isEmpty}>
									<ThreadWelcome />
								</AuiIf>

								<div style={{ maxWidth: chatFixedWidth ? "960px" : "100%", margin: "0 auto", width: "100%" }}>
									<ThreadPrimitive.Messages>
										{ThreadMsgFn}
									</ThreadPrimitive.Messages>
								</div>
								<SelectionPopover />
							</>
						)}

						{!isLoading && (
							<div className="sticky bottom-0 left-0 right-0 mt-auto flex flex-col items-center gap-4 pb-4 md:pb-6 pt-4 bg-[linear-gradient(to_bottom,transparent_0%,var(--wc-bg-page)_35%,var(--wc-bg-page)_100%)]">
								<ThreadPrimitive.ViewportFooter className="aui-thread-viewport-footer flex flex-col gap-4 overflow-visible" style={{ width: "44rem" }}>
									<ThreadScrollToBottom />
									<Elicitation />
									<AnnotationsBox />
									<Composer />
								</ThreadPrimitive.ViewportFooter>
							</div>
						)}
					</ThreadPrimitive.Viewport>
					</ThreadPrimitive.Root>

					{deletingMessageId && (
						<ConfirmDialog
							title="Delete Message"
							message="Are you sure you want to delete this message?"
							isOpen={true}
							onConfirm={deleteMessageCtx.confirm}
							onCancel={deleteMessageCtx.close}
							isLoading={deletingLoading}
							confirmLabel="Delete"
						/>
					)}
				</DictationProvider>
			</DeleteMessageContext.Provider>
		</ServerStatusContext.Provider>
	);
});

const ThreadMessage: FC = () => {
	const role = useAuiState((s) => s.message.role);
	const isEditing = useAuiState((s) => s.message.composer.isEditing);
	const parts = useAuiState((s) => s.message.content);
	const hasToolCalls = parts.some((part: any) => part.type === 'tool-call');

	if (isEditing) return <EditComposer />;
	if (role === "user") return <UserMessage />;
	if (hasToolCalls) return <ToolMessage />;
	return <AssistantMessage />;
};

const ThreadScrollToBottom: FC = () => {
	return (
		<ThreadPrimitive.ScrollToBottom asChild>
			<TooltipIconButton
				tooltip="Scroll to bottom"
				variant="outline"
				className="aui-thread-scroll-to-bottom absolute -top-12 z-10 self-center rounded-full p-4 disabled:invisible dark:border-border dark:bg-background dark:hover:bg-accent"
			>
				<ArrowDownIcon />
			</TooltipIconButton>
		</ThreadPrimitive.ScrollToBottom>
	);
};

const ThreadWelcome: FC = () => {
	const activeWorkspaceId = useStore(s => s.activeWorkspaceId);
	if (activeWorkspaceId) {
		return <WorkspaceView folderId={activeWorkspaceId} />;
	}
	return (
		<div className="aui-thread-welcome-root mx-auto my-auto flex w-full max-w-(--thread-max-width) grow flex-col">
			<div className="aui-thread-welcome-center flex w-full grow flex-col items-center justify-center">
				<div className="aui-thread-welcome-message flex size-full flex-col justify-center px-4" style={{
					alignItems: "center"
				}}>
					<Image
						src="/logo.png"
						alt=""
						mb="4"
						w="96px"
						h="96px"
						borderRadius="xl"
						opacity={0.8}
						objectFit="cover"
						className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both duration-200"
					/>
					<h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both font-semibold text-2xl duration-200" style={{ color: 'var(--wc-text-heading)' }}>
						Hello there!
					</h1>
					<p className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-xl delay-75 duration-200" style={{ color: 'var(--wc-text-secondary)' }}>
						How can I help you today?
					</p>
				</div>
			</div>
			<ThreadSuggestions />
		</div>
	);
};

const ThreadSuggestions: FC = () => {
	return (
		<div className="aui-thread-welcome-suggestions grid w-full @md:grid-cols-2 gap-2 pb-4">
			<ThreadPrimitive.Suggestions>
				{() => <ThreadSuggestionItem />}
			</ThreadPrimitive.Suggestions>
		</div>
	);
};

const ThreadSuggestionItem: FC = () => {
	return (
		<div className="aui-thread-welcome-suggestion-display fade-in slide-in-from-bottom-2 @md:nth-[n+3]:block nth-[n+3]:hidden animate-in fill-mode-both duration-200">
			<SuggestionPrimitive.Trigger send asChild>
				<Button
					variant="ghost"
					className="aui-thread-welcome-suggestion h-auto w-full @md:flex-col flex-wrap items-start justify-start gap-1 rounded-3xl border px-4 py-3 text-left text-sm transition-colors"
					style={{ backgroundColor: 'var(--wc-bg-card)', color: 'var(--wc-text-primary)' }}
					_hover={{ bg: 'var(--wc-bg-hover)' }}
				>
					<SuggestionPrimitive.Title className="aui-thread-welcome-suggestion-text-1 font-medium" />
					<SuggestionPrimitive.Description className="aui-thread-welcome-suggestion-text-2 empty:hidden" style={{ color: 'var(--wc-text-secondary)' }} />
				</Button>
			</SuggestionPrimitive.Trigger>
		</div>
	);
};

const ContextUsageBar: FC = () => {
	const { contextSize } = useContext(ChatConfigContext);
	const branchTokensCount = useContext(BranchTokensContext);
	const composerText = useAuiState((s) => s.composer.text);

	const inputTokens = composerText ? tokenEncoder.encode(composerText).length : 0;
	const total = branchTokensCount + inputTokens;
	const ctxLabel = contextSize > 0 ? (contextSize > 1000 ? `${(contextSize / 1000).toFixed(0)}k` : String(contextSize)) : '?';
	const pct = contextSize > 0 ? Math.min((total / contextSize) * 100, 100) : 0;
	const color = pct > 90 ? 'var(--wc-accent-red)' : pct > 70 ? 'var(--wc-accent-yellow-strong)' : 'var(--wc-text-muted)';

	return (
		<div className="flex items-center gap-2 px-1 pt-1" title={`Context: ${total.toLocaleString()} / ${contextSize > 0 ? contextSize.toLocaleString() : '?'} tokens`}>
			<div className="flex-1 h-1 rounded-full bg-muted/30 overflow-hidden">
				<div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: color }} />
			</div>
			<span className="text-[10px] font-mono text-muted-foreground/40 shrink-0">
				{total > 1000 ? `${(total / 1000).toFixed(1)}k` : total} / {ctxLabel}
			</span>
		</div>
	);
};

const Composer: FC = () => {
	const { isValidServer } = useContext(ServerStatusContext);
	const { waveformStream, setWaveformStream, subscribeTranscript } = useDictation();
	const annotatorVisible = useStore(s => s.annotatorVisible);
	const ttsIsSpeaking = useStore(s => s.ttsIsSpeaking);
	const annotations = useStore(s => s.annotations);
	const clearAnnotations = useStore(s => s.clearAnnotations);
	const aui = useAui();
	const composerText = useAuiState(s => s.composer.text);
	const editorRef = useRef<IWarpComposerEditorRef>(null);

	const handleChangeText = useCallback((text: string) => {
		aui.composer().setText(text);
	}, [aui]);

	const handleEnter = useCallback(() => {
		aui.composer().send({ startRun: true });
	}, [aui]);
	useAuiEvent("composer.send", () => {
		editorRef.current?.clear();
	});

	// Subscribe to dictation transcripts — only act when popover is not visible
	useEffect(() => {
		if (annotatorVisible) return;
		const unsubscribe = subscribeTranscript((text: string) => {
			const ed = editorRef.current?.getEditor();
			if (!ed) return;
			const needsSpace = !ed.getText().endsWith(' ');
			ed.chain().focus().insertContent((needsSpace ? ' ' : '') + text).run();
		});
		return unsubscribe;
	}, [annotatorVisible, subscribeTranscript, aui]);

	const handleSubmit = (e: React.FormEvent) => {
		if (!isValidServer) {
			e.preventDefault();
			document.dispatchEvent(new CustomEvent('server-selector-shake'));
			return;
		}
		if (annotations.length === 0) return;
		const lines = annotations.map((a, i) => `${i + 1}. "${a.selectedText}"\n   ${a.comment}`);
		const fullText = (lines.join('\n\n') + (composerText.trim() ? '\n\n' + composerText : '')).trim();
		aui.composer().setText(fullText);
		clearAnnotations();
	};

	return (
		<ComposerPrimitive.Root onSubmit={handleSubmit} className="aui-composer-root relative flex w-full flex-col">
			{ttsIsSpeaking ? <TTSFlameWaveform /> : null}
			<ComposerPrimitive.AttachmentDropzone asChild>
				<div
					data-slot="composer-shell"
					className="flex w-full flex-col gap-2 rounded-xl border p-(--composer-padding) transition-shadow focus-within:border-[var(--wc-border-default)] data-[dragging=true]:border-dashed data-[dragging=true]:bg-accent/50"
					style={{
						background: "var(--wc-bg-elevated)",
						boxShadow: "0px 10px 10px 10px rgba(0,0,0,0.15)",
						borderColor: "var(--wc-border-default)",
					}}
				>
					<ComposerAttachments />
					<ComposerUiSpace />
				 <ComposerEditor
						ref={editorRef}
						placeholder="Send a message..."
						className="aui-composer-editor max-h-32 min-h-10 w-full overflow-y-auto bg-transparent px-1.75 py-1 text-sm"
						onChangeText={handleChangeText}
						onEnter={handleEnter}
					/>
					<ComposerAction onStreamChange={setWaveformStream} />
					{waveformStream ? <VoiceWaveform stream={waveformStream} width={680} /> : <ContextUsageBar />}
				</div>
			</ComposerPrimitive.AttachmentDropzone>
		</ComposerPrimitive.Root>
	);
};

const ReasoningEffortToggle: FC = () => {
	const { reasoningEffort, onReasoningEffortChange, enableThinking, onEnableThinkingChange } = useContext(ChatConfigContext);
	const levels: EReasoningEffort[] = [EReasoningEffort.LOW, EReasoningEffort.MEDIUM, EReasoningEffort.HIGH, EReasoningEffort.NONE];
	const next = () => {
		const idx = levels.indexOf(reasoningEffort);
		const nextLevel = levels[(idx + 1) % levels.length]!;
		onReasoningEffortChange(nextLevel);
	};
	const isOn = enableThinking && reasoningEffort !== EReasoningEffort.NONE;
	const label = isOn ? reasoningEffort : 'off';
	const color = isOn
		? reasoningEffort === EReasoningEffort.LOW
			? 'var(--wc-accent-green)'
			: reasoningEffort === EReasoningEffort.MEDIUM
				? 'var(--wc-accent-yellow-strong)'
				: 'var(--wc-accent-red)'
		: 'var(--wc-text-muted)';
	return (
		<IconButton
			variant="outline"
			size="md"
			px="3"
			ml="1"
			borderRadius={"lg"}
			borderWidth="1px"
			borderColor={isOn ? color : "var(--wc-border-default)"}
			_hover={{ bg: 'var(--wc-bg-hover)' }}
			color={color}
			onClick={next}
			className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-accent`}
			title={`Reasoning effort: ${label} (click to cycle)`}
		>
			<BrainCircuit className={`${isOn ? '' : 'opacity-40'}`} />
			<span style={{ textTransform: "capitalize", fontSize: "12px" }}>{label}</span>
		</IconButton>
	);
};

const ToolsSelector: FC = React.memo(() => {
	const attachAllTools = useStore(s => s.attachAllTools);
	const attachedTools = useStore(s => s.attachedTools);
	const setAttachedTools = useStore(s => s.setAttachedTools);
	const mcpServers = useStore(s => s.mcpServers);

	const connectedServers = useMemo(() => {
		const entries = Object.entries(mcpServers).filter(([, state]) => state.status === EMcpServerStatus.CONNECTED);
		return entries as [string, { status: EMcpServerStatus; tools: { name: string; description: string; serverName: string }[] }][];
	}, [mcpServers]);

	const totalCount = useMemo(() => connectedServers.reduce((sum, [, s]) => sum + s.tools.length, 0), [connectedServers]);

	const color = (attachAllTools || attachedTools.length > 0) ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)';
	const label = attachAllTools ? 'All Tools' : attachedTools.length > 0 ? `${String(attachedTools.length)} Tool(s)` : 'Off';

	const handleAllToolsChange = useCallback((checked: boolean) => {
		if (checked) {
			setAttachedTools(true, []);
		} else {
			setAttachedTools(false, attachedTools);
		}
	}, [attachedTools]);

	const handleToolChange = useCallback((serverName: string, toolName: string, checked: boolean) => {
		if (attachAllTools) return;
		const tool: IToolAttachment = { serverName, toolName };
		let next: IToolAttachment[];
		if (checked) {
			next = [...attachedTools, tool];
		} else {
			next = attachedTools.filter(t => !(t.serverName === serverName && t.toolName === toolName));
		}
		setAttachedTools(false, next);
	}, [
		attachAllTools,
		attachedTools
	]);

	return (
		<Popover.Root lazyMount unmountOnExit>
			<Popover.Trigger unstyled asChild>
				<IconButton
					variant="outline"
					size="md"
					px="3"
					ml="1"
					borderRadius={"lg"}
					borderWidth="1px"
					borderColor={(attachAllTools || attachedTools.length > 0) ? color : "var(--wc-border-default)"}
					_hover={{ bg: 'var(--wc-bg-hover)' }}
					color={color}
					className="flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-accent"
					title={`Tools: ${label}`}
				>
					<VscTools className={`${(attachAllTools || attachedTools.length > 0) ? '' : 'opacity-40'}`} />
					<span style={{ fontSize: "12px" }}>{label}</span>
				</IconButton>
			</Popover.Trigger>
			<Popover.Positioner>
				<Popover.Content
					w="280px"
					maxH="70vh"
					overflow="auto"
					bg="var(--wc-bg-elevated)"
					borderWidth="1px"
					borderColor="var(--wc-border-overlay)"
					borderRadius="lg"
					shadow="0 8px 32px var(--wc-overlay-modal)"
				>
					<Popover.Body p="3">
						{totalCount === 0 ? (
							<Text fontSize="12px" color="var(--wc-text-faint)" textAlign="center" py="4">No tools available</Text>
						) : (
							<VStack gap="3" align="stretch">
								<HStack gap="2">
									<Switch.Root
										label="All tools"
										checked={attachAllTools}
										onCheckedChange={(details) => handleAllToolsChange(details.checked)}
									>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: attachAllTools ? 'var(--wc-accent-blue)' : 'var(--wc-text-disabled)' }}>
											<Switch.Thumb css={{ bg: 'var(--wc-bg-elevated)' }} />
										</Switch.Control>
										<Switch.Label ml="2" fontSize="12px" color={attachAllTools ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} userSelect="none">
											All tools
										</Switch.Label>
									</Switch.Root>
								</HStack>
								<AccordionRoot collapsible defaultValue={[]}>
							{connectedServers.map(([serverName, state]) => {
									const activeCount = attachedTools.filter(t => t.serverName === serverName).length;
									return (
										<AccordionItemComp key={serverName} value={serverName} style={{ border: 'none' }}>
											<AccordionItemTrigger
												style={{
													padding: '8px',
													borderRadius: '6px',
													background: 'var(--wc-bg-card)',
													border: 'none',
													cursor: 'pointer',
													display: 'flex',
													justifyContent: 'space-between',
													alignItems: 'center',
													width: '100%',
												}}
											>
												<Text fontSize="11px" fontWeight="600" color={activeCount ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} textTransform="uppercase" letterSpacing="0.05em">
													{serverName}
												</Text>
												<Text fontSize="10px" color={activeCount ? 'var(--wc-accent-blue)' : 'var(--wc-text-faint)'}>{state.tools.length}{activeCount ? ` (${activeCount})` : ''}</Text>
											</AccordionItemTrigger>
											<AccordionItemContent pt="1" pb="2" px="2" style={{ border: 'none' }}>
												<VStack gap="1.5" align="stretch">
													{state.tools.map(tool => {
														const isSelected = attachAllTools || attachedTools.some(t => t.serverName === serverName && t.toolName === tool.name);
														return (
															<HStack key={tool.name} gap="2" opacity={attachAllTools ? 0.4 : 1}>
																<Switch.Root
																	label={tool.name}
																	checked={isSelected}
																	disabled={attachAllTools}
																	onCheckedChange={(details) => {
																		if (!attachAllTools) handleToolChange(serverName, tool.name, details.checked);
																	}}
																>
																	<Switch.HiddenInput />
																	<Switch.Control css={{ bg: isSelected && !attachAllTools ? 'var(--wc-accent-blue)' : 'var(--wc-text-disabled)' }}>
<Switch.Thumb css={{ bg: 'var(--wc-bg-elevated)'}} />
								</Switch.Control>
								<Switch.Label ml="0" fontSize="12px" color={isSelected ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'} userSelect="none">
																		{tool.name}
																	</Switch.Label>
																</Switch.Root>
															</HStack>
														);
													})}
												</VStack>
											</AccordionItemContent>
										</AccordionItemComp>
									);
								})}
								</AccordionRoot>
							</VStack>
						)}
					</Popover.Body>
				</Popover.Content>
			</Popover.Positioner>
		</Popover.Root>
	);
});

const ComposerAction: FC<{ onStreamChange?: (stream: MediaStream | null) => void }> = ({ onStreamChange }) => {
	const { isValidServer, supportsMultiModal } = useContext(ServerStatusContext);
	const currentThreadId = useStore(s => s.currentThreadId);
	const canAttach = isValidServer && supportsMultiModal;
	const aui = useAui();
	const annotations = useStore(s => s.annotations);
	const clearAnnotations = useStore(s => s.clearAnnotations);
	const composerDisabled = useAuiState(s => s.composer.isEmpty || !s.composer.isEditing);
	const composerText = useAuiState(s => s.composer.text);
	const isSendDisabled = composerDisabled && annotations.length === 0;

	const handleSend = useCallback(() => {
		if (isSendDisabled) return;
		if (annotations.length > 0) {
			const lines = annotations.map((a, i) => `${i + 1}. "${a.selectedText}"\n   ${a.comment}`);
			const fullText = (lines.join('\n\n') + (composerText.trim() ? '\n\n' + composerText : '')).trim();
			aui.composer().setText(fullText);
			clearAnnotations();
		}
		aui.composer().send({ startRun: true });
		clearComposerEditor();
	}, [isSendDisabled, annotations, composerText, clearAnnotations]);

	return (
		<div className="aui-composer-action-wrapper relative flex items-center justify-between">
			<div className="flex items-center gap-1">
				<ComposerAddAttachment disabled={!canAttach} tooltip={canAttach ? "Add Attachment" : "Multimodal not supported"} />
				<ReasoningEffortToggle />
				{/* <ToolsToggle /> */}
				<ToolsSelector />
				<EmbeddingToggle />
			</div>
			<div className="flex items-center gap-2">
				<VoiceInput threadId={currentThreadId} onTranscript={(text) => {
					insertComposerText(text);
				}} aui={aui} onStreamChange={onStreamChange} />
				<ThreadWhisperServerSelector />
				<ThreadServerSelector threadId={currentThreadId} />
				<AuiIf condition={(s) => !s.thread.isRunning}>
					<TooltipIconButton
						onClick={handleSend}
						disabled={!isValidServer || isSendDisabled}
						tooltip={!isValidServer ? "Select and start a model first" : "Send message"}
						side="bottom"
						type="button"
						variant="outline"
						className={`${(!isValidServer || isSendDisabled) ? 'opacity-50 cursor-not-allowed' : ''} aui-composer-send size-9`}
						aria-label={!isValidServer ? "Send message - model not selected" : "Send message"}
						style={!isValidServer
							? { color: 'var(--wc-text-muted)', borderColor: 'var(--wc-border-default)', backgroundColor: 'transparent' }
							: { color: 'var(--wc-accent-blue)', borderColor: 'var(--wc-accent-blue-border)', backgroundColor: 'var(--wc-accent-blue-bg-8)' }
						}
						_hover={!isValidServer ? undefined : { color: 'var(--wc-accent-blue-hover)', borderColor: 'var(--wc-accent-blue-border)', backgroundColor: 'var(--wc-accent-blue-bg-10)' }}
					>
						<SendHorizonal className="aui-composer-send-icon size-4" />
					</TooltipIconButton>
				</AuiIf>
				<AuiIf condition={(s) => s.thread.isRunning}>
					<ComposerPrimitive.Cancel asChild>
						<Button
							type="button"
							variant="outline"
							className="aui-composer-cancel size-9"
							aria-label="Stop generating"
							color="var(--wc-text-primary)"
							borderColor="var(--wc-border-default)"
						style={{ borderColor: 'var(--wc-border-default)' }}
						>
							<SquareIcon className="aui-composer-cancel-icon size-4 fill-current" />
						</Button>
					</ComposerPrimitive.Cancel>
				</AuiIf>
			</div>
		</div>
	);
};

const MessageError: FC = () => {
	return (
		<MessagePrimitive.Error>
			<ErrorPrimitive.Root className="aui-message-error-root mt-2 rounded-md border p-3 text-sm" style={{ borderColor: 'var(--wc-accent-red)', backgroundColor: 'var(--wc-accent-red-bg-8)', color: 'var(--wc-accent-red)' }}>
				<ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
			</ErrorPrimitive.Root>
		</MessagePrimitive.Error>
	);
};

const StatsTooltip: FC = () => {
	const custom = useAuiState((s) => (s.message.metadata as any)?.custom);
	if (!custom) return null;

	const { promptPerSecond, predictedPerSecond, predictedMs, actualTokens } = custom;
	const hasStats = promptPerSecond > 0 || predictedPerSecond > 0 || (actualTokens != null && actualTokens > 0) || predictedMs > 0;
	if (!hasStats) return null;

	const stats: { label: string; value: string }[] = [];
	if (promptPerSecond > 0) stats.push({ label: 'pp', value: `${promptPerSecond.toFixed(1)} t/s` });
	if (predictedPerSecond > 0) stats.push({ label: 'tg', value: `${predictedPerSecond.toFixed(1)} t/s` });
	if (actualTokens != null && actualTokens > 0) stats.push({ label: 'c', value: `${actualTokens} tks` });
	if (predictedMs > 0) stats.push({ label: 'tt', value: `${(predictedMs / 1000).toFixed(1)} s` });

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-help p-1 rounded hover:bg-muted/50 transition-colors" style={{margin: "0 8px 0 0"}}>
					<Timer size={16} style={{ color: "var(--wc-text-muted)" }}  />
				</div>
			</TooltipTrigger>
			<TooltipContent align="start" sideOffset={4} side={"bottom"}>
				<div className="text-sm" style={{ color: 'var(--wc-special-white)', boxShadow: "0 0 10px black"}}>
					{stats.map((s, i) => (
						<span key={s.label}>
							<span style={{ color: "var(--wc-text-muted)" }}>{s.label}</span>&nbsp;{s.value}&nbsp;&nbsp;
						</span>
					))}
				</div>
			</TooltipContent>
		</Tooltip>
	);
};

const EmbeddingStatus: FC = React.memo(() => {
	const messageId = useAuiState(s => s.message.id);
	const embedded = useStore(s => s.embeddingStatusByMessage[messageId]);
	const selectedServerId = useStore(s => s.selectedEmbeddingServerId);
	const servers = useStore(s => s.servers);
	const applyEmbeddingEmbedded = useStore(s => s.applyEmbeddingEmbedded);
	const removeEmbeddingStatus = useStore(s => s.removeEmbeddingStatus);
	const [loading, setLoading] = useState(false);
	const selectedServer = selectedServerId ? servers[selectedServerId] : null;

	const handleClick = useCallback(async () => {
		if (!selectedServer || loading) return;
		setLoading(true);
		try {
			if (embedded) {
				const res = await fetch(`/api/chat/messages/${messageId}/embed?serverId=${encodeURIComponent(selectedServer.id)}&topic=global`, { method: 'DELETE' });
				if (res.ok) removeEmbeddingStatus(messageId);
			} else {
				const res = await fetch(`/api/chat/messages/${messageId}/embed?serverId=${encodeURIComponent(selectedServer.id)}&topic=global`, { method: 'POST' });
				if (res.ok) applyEmbeddingEmbedded(messageId);
			}
		} catch { /* ignore */ }
		finally { setLoading(false); }
	}, [messageId, embedded, selectedServer, loading, applyEmbeddingEmbedded, removeEmbeddingStatus]);

	if (!selectedServer || selectedServer.status !== EServerStatus.RUNNING) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="cursor-pointer p-1 rounded hover:bg-muted/50 transition-colors" style={{ margin: "0 8px 0 0", opacity: loading ? 0.5 : 1 }} onClick={handleClick}>
					<LuDatabaseZap size={16} style={{ color: embedded ? "var(--wc-accent-purple)" : "var(--wc-text-muted)" }} />
				</div>
			</TooltipTrigger>
			<TooltipContent align="start" sideOffset={4} side="bottom">
				<div className="text-sm" style={{ color: 'var(--wc-special-white)', boxShadow: "0 0 10px black" }}>
					<span>{embedded ? 'Embedded (click to remove)' : 'Embed message'}</span>
				</div>
			</TooltipContent>
		</Tooltip>
	);
});

const ToolCallRenderer: FC = () => {
	const part = useAuiState(s => s.part);
	
	return (
		<ToolCallBlockWrapper
			toolCallId={(part as any).toolCallId}
			toolName={(part as any).toolName}
			serverName={(part as any).serverName ?? 'unknown'}
			args={(part as any).args}
			result={(part as any).result}
			status={mapStatusFromPart((part as any).status)}
		/>
	);
};

function mapStatusFromPart(status: any): 'complete' | 'running' | 'requires-action' | 'error' {
	if (!status) return 'complete';
	if (status.type === 'complete') return 'complete';
	if (status.type === 'running') return 'running';
	if (status.type === 'requires-action') return 'requires-action';
	if (status.type === 'incomplete') return 'error';
	return 'complete';
}

const LoadingDot: FC<{ status: { type: string } }> = ({ status }) => {
	if (status?.type !== 'running') return null;
	return (
		<div className="flex items-center py-1">
			<div className="size-2 rounded-full bg-white/80 animate-pulse" />
		</div>
	);
};

const componentsMap = {
	 Text: () => <MarkdownText />,
		Reasoning: () => <ReasoningBlock />,
		Empty: LoadingDot,
		tools: {
			Fallback: ToolCallRenderer,
		},
};

const AssistantMessage: FC = React.memo(() => {
	const parts = useAuiState((s) => s.message.content);
	const status = useAuiState((s) => s.message.status?.type);
	const messageId = useAuiState((s) => s.message.id);
	const startingTools = useStore((s) => s.startingToolsByMessage[messageId]);
	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	// Skip rendering empty assistant messages (converted TOOL messages)
	// BUT render if status is "running" so the loading indicator appears during prompt processing
	if (parts.length === 0 && status !== 'running') return null;

	return (
		<MessagePrimitive.Root
			className="aui-assistant-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full animate-in py-3 duration-150"
			data-role="assistant"
			data-message-id={messageId}
			style={{
				paddingRight: "100px",
			}}
		>
			<div className="aui-assistant-message-content wrap-break-word px-2 leading-relaxed" style={{ color: 'var(--wc-text-primary)', fontSize: `${chatFontSize}px`, fontFamily: chatFontFamily || undefined, backgroundColor: "var(--wc-bg-subtle)", padding: "15px", borderRadius: "15px" }}>
				<MessagePrimitive.Parts
					components={componentsMap}
				/>
				{startingTools && startingTools.length > 0 && (
					<div className="mt-2 text-md italic" style={{ color: 'var(--wc-text-tertiary)' }}>
						calling: {startingTools.join(', ')}...
					</div>
				)}
				<MessageError />
			</div>

			<div className="aui-assistant-message-footer mt-1 ml-2 flex min-h-6 items-center gap-1">
				 <StatsTooltip />
				 <BranchPicker />
				 <AssistantActionBar />
			 </div>
		 </MessagePrimitive.Root>
	 );
 });

const ReasoningBlock: FC = React.memo(() => {
	const reasoning = useAuiState((s) => {
		const part = s.part;
		return part?.type === 'reasoning' ? (part as any).reasoning : '';
	});
	const [open, setOpen] = useState(false);
	if (!reasoning) return null;

	return (
		
		<div className="mb-3 rounded-lg border" style={{ borderColor: 'var(--wc-border-subtle)', backgroundColor: 'var(--wc-bg-subtle)' }}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors"
					style={{ color: 'var(--wc-text-muted)' }}
			>
				<BrainCircuitIcon className="size-3.5" />
				<span>Thinking{reasoning.length > 100 ? ` (${Math.ceil(reasoning.length / 4)} tokens est.)` : ''}</span>
				<ChevronDownIcon className={`size-3.5 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
			</button>
			{open && (
				<div className="px-3 pb-3 text-xs whitespace-pre-wrap max-h-64 overflow-y-auto" style={{ color: 'var(--wc-text-secondary)' }}>
					{reasoning}
				</div>
			)}
		</div>
	);
});

const ActionBarIcon: FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
	<Box
		w="28px"
		h="28px"
		display="flex"
		alignItems="center"
		justifyContent="center"
		cursor="pointer"
		rounded="md"
		color="var(--wc-text-secondary)"
		_hover={{ bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' }}
		onClick={onClick}
	>
		{children}
	</Box>
);

const DeleteMessageButton: FC<{ messageId: string }> = ({ messageId }) => {
	const ctx = useContext(DeleteMessageContext);
	return (
		<ActionBarIcon onClick={() => ctx?.open(messageId)}>
			<Trash2 size={14} color={"var(--wc-accent-red)"} />
		</ActionBarIcon>
	);
};

const BrowserTTS = React.memo(() => {
	const [speaking, setSpeaking] = useState(false);
	const parts = useAuiState((s) => s.message.content);
	const messageText = useMemo(() => {
		if (!parts || parts.length === 0) return '';
		return parts
			.filter((p: any) => p.type === 'text')
			.map((p: any) => p.text)
			.join('\n\n');
	}, [parts]);

	const handleSpeak = useCallback(() => {
		if (speaking) {
			window.speechSynthesis.cancel();
			setSpeaking(false);
			return;
		}
		if (!messageText.trim()) return;
		window.speechSynthesis.cancel();
		const utterance = new SpeechSynthesisUtterance(messageText);
		utterance.onend = () => setSpeaking(false);
		utterance.onerror = () => setSpeaking(false);
		setSpeaking(true);
		window.speechSynthesis.speak(utterance);
	}, [speaking, messageText]);

	return (
		<ActionBarIcon onClick={handleSpeak}>
			{speaking ? <SquareIcon size={14} /> : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});

const AssistantActionBar: FC = () => {
	const messageId = useAuiState((s) => s.message.id);
	const isCopied = useAuiState((s) => s.message.isCopied);
	const kokoroInstalled = useStore((s) => s.kokoroStatus?.installed);
	const clearAnnotations = useStore((s) => s.clearAnnotations);

	return (
		<ActionBarPrimitive.Root
			className="aui-assistant-action-bar-root col-start-3 row-start-2 -ml-1"
			style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
		>

			{kokoroInstalled ? <KokoroTTSButton /> : <BrowserTTS />}

			<ActionBarPrimitive.Copy asChild>
				<ActionBarIcon>
					{isCopied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
				</ActionBarIcon>
			</ActionBarPrimitive.Copy>

			<ActionBarPrimitive.Reload asChild>
				<ActionBarIcon onClick={clearAnnotations}>
					<RefreshCwIcon size={14} />
				</ActionBarIcon>
			</ActionBarPrimitive.Reload>

			<ActionBarPrimitive.Edit asChild>
				<ActionBarIcon>
					<PencilIcon size={14} />
				</ActionBarIcon>
			</ActionBarPrimitive.Edit>

			<EmbeddingStatus />
			<DeleteMessageButton messageId={messageId} />

		</ActionBarPrimitive.Root>
	);
};

const ToolMessage: FC = React.memo(() => {
	const parts = useAuiState((s) => s.message.content);
	const status = useAuiState((s) => s.message.status?.type);
	const messageId = useAuiState((s) => s.message.id);
	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	if (parts.length === 0 && status !== 'running') return null;

	return (
		<MessagePrimitive.Root
			className="aui-tool-message-root fade-in slide-in-from-bottom-1 relative mx-auto w-full animate-in py-3 duration-150"
			data-role="tool"
			data-message-id={messageId}
			style={{
				paddingRight: "100px",
			}}
		>
			<div className="aui-tool-message-content wrap-break-word px-2 leading-relaxed" style={{ color: 'var(--wc-text-primary)', fontSize: `${chatFontSize}px`, fontFamily: chatFontFamily || undefined, backgroundColor: "var(--wc-bg-subtle)", padding: "15px", borderRadius: "15px" }}>
				<MessagePrimitive.Parts
					components={componentsMap}
				/>
				<MessageError />
			</div>

			<div className="aui-tool-message-footer mt-1 ml-2 flex min-h-6 items-center gap-1">
				<StatsTooltip />
				<BranchPicker />
				<ToolActionBar />
			</div>
		</MessagePrimitive.Root>
	);
});

const ToolActionBar: FC = () => {
	const messageId = useAuiState((s) => s.message.id);
	const clearAnnotations = useStore((s) => s.clearAnnotations);

	return (
		<ActionBarPrimitive.Root
			className="aui-tool-action-bar-root col-start-3 row-start-2 -ml-1"
			style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
		>
			<ActionBarPrimitive.Reload asChild>
				<ActionBarIcon onClick={clearAnnotations}>
					<RefreshCwIcon size={14} />
				</ActionBarIcon>
			</ActionBarPrimitive.Reload>
			<EmbeddingStatus />
			<DeleteMessageButton messageId={messageId} />
		</ActionBarPrimitive.Root>
	);
};

const UserMessage: FC = () => {
	const chatFontSize = useStore(s => s.settings.chatFontSize ?? 14);
	const chatFontFamily = useStore(s => s.settings.chatFontFamily ?? '');
	const messageId = useAuiState((s) => s.message.id);
	return (
		<MessagePrimitive.Root
			className="aui-user-message-root fade-in slide-in-from-bottom-1 mx-auto flex w-full flex-col gap-2 animate-in px-2 py-3 duration-150"
			data-role="user"
			data-message-id={messageId}
		>
			<UserMessageAttachments />
			<div className="flex justify-end">
				<div className="aui-user-message-content wrap-break-word peer rounded-2xl bg-muted px-4 py-2.5 text-foreground empty:hidden max-w-[80%]" style={{ fontSize: `${chatFontSize}px`, fontFamily: chatFontFamily || undefined }}>
					<MessagePrimitive.Parts />
				</div>
			</div>
			<div className="aui-user-message-footer flex min-h-6 items-center justify-end">
				<StatsTooltip />
				<UserActionBar />
				<BranchPicker className="aui-user-branch-picker" />
			</div>
		</MessagePrimitive.Root>
	);
};

const UserActionBar: FC = () => {
	const messageId = useAuiState((s) => s.message.id);
	//const message = useAuiState((s) => s.message);
	const kokoroInstalled = useStore((s) => s.kokoroStatus?.installed);
	
	return (
		<ActionBarPrimitive.Root
			className="aui-user-action-bar-root"
			style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
		>
			{kokoroInstalled ? <KokoroTTSButton /> : <BrowserTTS />}

			<ActionBarPrimitive.Edit asChild>
				<ActionBarIcon>
					<PencilIcon size={14} />
				</ActionBarIcon>
			</ActionBarPrimitive.Edit>
			
			<EmbeddingStatus />
			<DeleteMessageButton messageId={messageId} />
		</ActionBarPrimitive.Root>
	);
};

const EditComposer: FC = () => {
	return (
		<MessagePrimitive.Root className="aui-edit-composer-wrapper mx-auto flex w-full flex-col px-2 py-3">
			<ComposerPrimitive.Root className="aui-edit-composer-root ml-auto flex w-full max-w-[85%] flex-col bg-muted" >
				<ComposerPrimitive.Input
					className="aui-edit-composer-input min-h-14 w-full resize-none bg-transparent p-4 text-foreground text-sm outline-none rounded-sm"
					autoFocus
				/>
				<div className="aui-edit-composer-footer mx-3 mb-3 flex items-center gap-2 self-end">
					<ComposerPrimitive.Cancel asChild>
						<Button variant="ghost" size="sm">
							Cancel
						</Button>
					</ComposerPrimitive.Cancel>
					<ComposerPrimitive.Send asChild>
						<Button size="sm">Update</Button>
					</ComposerPrimitive.Send>
				</div>
			</ComposerPrimitive.Root>
		</MessagePrimitive.Root>
	);
};

// const BranchPickerWrapper: FC = () => {
// 	const { isValidServer } = useContext(ServerStatusContext);
// 	if (!isValidServer) return null;
// 	return <BranchPicker />;
// };

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
	className,
	...rest
}) => {
	return (
		<BranchPickerPrimitive.Root
			hideWhenSingleBranch
			className={cn(
				"aui-branch-picker-root mr-2 -ml-2 inline-flex items-center text-muted-foreground text-xs",
				className,
			)}
			{...rest}
		>
			<BranchPickerPrimitive.Previous asChild>
				<TooltipIconButton tooltip="Previous">
					<ChevronLeftIcon />
				</TooltipIconButton>
			</BranchPickerPrimitive.Previous>
			<span className="aui-branch-picker-state font-medium">
				<BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
			</span>
			<BranchPickerPrimitive.Next asChild>
				<TooltipIconButton tooltip="Next">
					<ChevronRightIcon />
				</TooltipIconButton>
			</BranchPickerPrimitive.Next>
		</BranchPickerPrimitive.Root>
	);
};
