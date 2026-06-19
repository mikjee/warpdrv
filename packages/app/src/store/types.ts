import type React from 'react';
import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, IDevice, TBackendId, IBackend, TBackendGroupId, IBackendGroup, TRecipeId, IRecipe, IRecipeRunState, TStepId, IServerSlotsState, ICheckpoint, TCheckpointId, TModelId, IModel, ISettings, TWhisperBackendId, IWhisperBackend, TWhisperServerId, IWhisperServer, IWhisperModel, IHardwareInfo, IBackendAsset, IKokoroStatus } from '@warpcore/shared';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
export { type ImmerSet, type ImmerGet } from '@warpcore/bridge';

export type TCanRenderResult = Record<string, unknown> | false;

export interface IToolCallRenderer {
	component: React.ComponentType<any>;
	keywords: string[];
	canRender: (args: Record<string, unknown>) => TCanRenderResult;
}

export interface IToolCallRenderer {
	component: React.ComponentType<any>;
	keywords: string[];
	canRender: (args: Record<string, unknown>) => TCanRenderResult;
}
import type {
	IMcpServerState,
	IToolPermission,
	IThreadToolPermission,
	IToolAttachment,
	IServerPermission as IMcpServerPermission,
	IFolder,
	IWorkspace,
	IChatThread,
	IChatMessage,
	IToolCall,
	IThreadPatch,
	IMessagePatch,
	TThreadId,
	TMessageId,
	TMessagePartId,
	TToolCallId,
	TFolderId,
	IElicitationRequest,
} from '@warpcore/bridge';
import { IAnnotation } from '@/store/slices/annotations';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import type { EUISpaceLoc, TAppletName, TUISpaceComponent, TUISpaceComponentId, TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import type { EChatSidebarTab } from '@/store/slices/chatSidebar';

export interface AppState {
	// SSE Connection
	sseConnected: boolean;
	setSseConnected: (connected: boolean) => void;

	// Phase 0.5 Test
	testData: any | null;

	// Servers (Phase 1)
	servers: Record<TServerId, IServer>;
	serverStats: Record<TServerId, IServerStats>;
	serverLogs: Record<TServerId, string[]>;
	serverSlots: Record<TServerId, IServerSlotsState>;

	// Downloads (Phase 1)
	downloads: Record<TDownloadId, IDownload>;

	// Devices (Phase 1)
	devices: IDevice[];

	// Backends (Phase 1)
	backends: Record<TBackendId, IBackend>;

	// Backend Groups (Phase 1)
	backendGroups: Record<TBackendGroupId, IBackendGroup>;

	// Whisper Backends
	whisperBackends: Record<TWhisperBackendId, IWhisperBackend>;

	// Whisper Servers
	whisperServers: Record<TWhisperServerId, IWhisperServer>;
	whisperServerLogs: Record<TWhisperServerId, string[]>;

	// Whisper Models
	whisperModels: Record<string, IWhisperModel>;

	// Whisper chat state
	selectedWhisperServerId: string | null;
	setSelectedWhisperServerId: (id: string | null) => void;

	// Models
	models: Record<TModelId, IModel>;

	// Settings
	settings: ISettings;
	// Hardware detection
	hardware: IHardwareInfo | null;
	// Llama / Whisper backend releases
	llamaReleases: Record<string, IBackendAsset>;
	whisperReleases: Record<string, IBackendAsset>;
	// Kokoro TTS install status
	kokoroStatus: IKokoroStatus | null;
	setKokoroStatus: (status: IKokoroStatus | null) => void;

	// TTS playback state
	ttsActiveMessageId: string | null;
	ttsIsGenerating: 'button' | 'vad' | null;
	ttsIsSpeaking: boolean;
	ttsSpokenByMessage: Record<string, number>;
	ttsVadSentencesSent: number;
	ttsVadSentencesDone: number;
	ttsVadRequestId: number;
	ttsStart: (messageId: string, mode?: 'button' | 'vad') => void;
	ttsStop: () => void;
	ttsSetGenerating: (v: 'button' | 'vad' | null) => void;
	ttsSetSpeaking: (v: boolean) => void;
	ttsSetActiveMessageId: (messageId: string | null) => void;
	ttsSetSpokenIndex: (messageId: string, index: number) => void;
	ttsClearSpokenIndex: (messageId: string) => void;
	ttsVadIncSent: () => void;
	ttsVadIncDone: () => void;
	ttsVadReset: () => void;
	vadActive: boolean;
	setVadActive: (v: boolean) => void;
	ttsVadNewRequestId: () => number;

	// Proxy (Phase 1)
	proxyStatus: IProxyStatus | null;
	proxyRoutes: IStickyRouteInfo[];

	// SSE Event Handlers (centralized)
	SSEHandlers: Record<string, (data: any) => void>;

	// Elicitations
	elicitationByThread: Record<TThreadId, IElicitationRequest>;
	applyElicitationRequest: (threadId: TThreadId, request: IElicitationRequest) => void;
	applyElicitationResolved: (id: string) => void;

	// MCP (Bridge canonical names)
	mcpServers: Record<string, IMcpServerState>;
	serverPermissions: IMcpServerPermission[];
	toolPermissions: IToolPermission[];
	threadToolPermissions: Record<TThreadId, IThreadToolPermission[]>;
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setPermissions: (serverPerms: IMcpServerPermission[], toolPerms: IToolPermission[]) => void;
	setThreadToolPermissions: (threadId: TThreadId, perms: IThreadToolPermission[]) => void;
	toolCallRenderers: Record<string, IToolCallRenderer>;
	registerToolCallRenderer: (name: string, entry: IToolCallRenderer) => void;

	reset: () => void;

	// Bridge Chat State
	threads: Record<TThreadId, IChatThread>;
	chunksByMessageId: Record<string, {
		partId: string,
		chunk: string,
		lastUpdate: Date,
	}>;
	messagesByThread: Record<TThreadId, Record<TMessageId, IChatMessage>>;
	headMessageIdByThread: Record<TThreadId, TMessageId>;
	toolCallsById: Record<TToolCallId, IToolCall>;
	startingToolsByMessage: Record<TMessageId, string[]>;
	isRunningByThread: Record<TThreadId, boolean>;
	activeThreadId: TThreadId | null;

	// Inference error tracking
	inferenceError: { threadId: TThreadId; messageId: TMessageId; error: string } | null;

	// Embedding error tracking
	embeddingError: { error: string } | null;

	// Embedding status - messageIds that have embeddings for current selection
	embeddingStatusByMessage: Record<TMessageId, true>;
	setThreadEmbeddingStatuses: (messageIds: string[]) => void;
	applyEmbeddingEmbedded: (messageId: string) => void;
	removeEmbeddingStatus: (messageId: string) => void;
	clearEmbeddingStatuses: () => void;

	// Bridge Actions
	applyThreadCreated: (thread: IChatThread) => void;
	applyThreadUpdated: (threadId: TThreadId, updates: IThreadPatch) => void;
	applyThreadDeleted: (threadId: TThreadId) => void;
	applyMessageCreated: (message: IChatMessage) => void;
	applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) => void;
	applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) => void;
	applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) => void;
	applyToolCallStarting: (messageId: TMessageId, name: string) => void;
	applyToolCallCreated: (toolCall: IToolCall) => void;
	applyToolCallUpdated: (toolCall: IToolCall) => void;
	applyInferenceStarted: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceError: (threadId: TThreadId, messageId: TMessageId, error: string) => void;
	applyEmbeddingError: (error: string) => void;
	seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) => void;
	setThreads: (threads: Record<TThreadId, IChatThread>) => void;
	setActiveThread: (id: TThreadId | null) => void;
	setHeadMessageId: (threadId: TThreadId, messageId: TMessageId) => void;

	// Current chat state
	currentThreadId: TThreadId | null;
	currentSystemPrompt: string;
	currentInferenceParams: Record<string, unknown>;
	setCurrentThreadId: (id: TThreadId | null) => void;
	setCurrentSystemPrompt: (prompt: string) => void;
	setCurrentInferenceParams: (params: Record<string, unknown>) => void;
	tempThreadServerId: string | null;
	setTempThreadServerId: (id: string | null) => void;
	tempAutoEmbed: boolean;
	setTempAutoEmbed: (v: boolean) => void;
	tempThreadState: Record<string, unknown>;

	// Attached tools
	attachAllTools: boolean;
	attachedTools: IToolAttachment[];
	setAttachedTools: (attachAll: boolean, tools: IToolAttachment[]) => void;

	// Recipes
	recipes: Record<TRecipeId, IRecipe>;
	activeRun: IRecipeRunState | null;
	stepOutputs: Record<TStepId, string>;
	// Checkpoints
	checkpoints: Record<TCheckpointId, ICheckpoint>;

	// Chat Folders
	folders: IFolder[];
	setFolders: (folders: IFolder[]) => void;

	// Workspaces
	activeWorkspaceId: TFolderId | null;
	setActiveWorkspaceId: (id: TFolderId | null) => void;
	workspaces: Record<TFolderId, IWorkspace>;
	setWorkspace: (workspace: IWorkspace) => void;

	// Persisted states
	workspaceStates: Record<TFolderId, Record<string, unknown>>;
	threadStates: Record<TThreadId, Record<string, unknown>>;
	messageStates: Record<TMessageId, Record<string, unknown>>;
	setWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => void;
	setThreadState: (threadId: TThreadId | null, data: Record<string, unknown>) => void;
	setMessageState: (messageId: TMessageId, data: Record<string, unknown>) => void;
	initWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => void;
	initThreadState: (threadId: TThreadId, data: Record<string, unknown>) => void;
	initMessageStates: (states: Array<{ messageId: TMessageId; data: Record<string, unknown> }>) => void;
	applyWorkspaceStateUpdated: (folderId: TFolderId, data: Record<string, unknown>) => void;
	applyThreadStateUpdated: (threadId: TThreadId, data: Record<string, unknown>) => void;
	applyMessageStateUpdated: (messageId: TMessageId, data: Record<string, unknown>) => void;

	// Annotations
	annotations: IAnnotation[];
	annotatorVisible: boolean;
	addAnnotation: (selectedText: string, comment: string) => void;
	removeAnnotation: (id: string) => void;
	clearAnnotations: () => void;
	setAnnotatorVisible: (v: boolean) => void;

	// Embedding
	selectedEmbeddingServerId: string | null;
	setSelectedEmbeddingServerId: (id: string | null) => void;

	// Chat sidebar state
	chatSidebarOpen: boolean;
	chatSidebarTab: EChatSidebarTab;
	setChatSidebarOpen: (v: boolean) => void;
	setChatSidebarTab: (tab: EChatSidebarTab) => void;
	openChatSidebarTab: (tab: EChatSidebarTab) => void;

	// Slash commands
	slashCommands: Record<string, ISlashCommand>;
	slashCommandsByApplet: Record<string, Record<string, true>>;
	registerSlashCommand: (command: ISlashCommand, appletName?: string) => void;
	unregisterSlashCommand: (name: string, appletName?: string) => void;

	// UI Spaces
	uiSpaceComponentsById: Record<TUISpaceComponentId, TUiSpaceComponentDef>;
	uiSpaceComponentsByLocation: Partial<Record<EUISpaceLoc, Record<TUISpaceComponentId, true>>>;
	uiSpaceComponentsByApplet: Record<TAppletName, Record<TUISpaceComponentId, true>>;
	registerUiSpaceComponent: (def: { componentId?: TUISpaceComponentId; label?: string; appletName: TAppletName; location: EUISpaceLoc; component: TUISpaceComponent; props?: Record<string, unknown> }) => TUISpaceComponentId;
	unregisterUiSpaceComponent: (appletName: string, componentId?: TUISpaceComponentId) => void;
	setUiSpaceComponentProps: (componentId: TUISpaceComponentId, propsPatch: Record<string, unknown>) => void;

	// Pending slash commands (extracted from editor, stored until send)
	pendingSlashCommands: IExtractedSlashCommand[];
	setPendingSlashCommands: (commands: IExtractedSlashCommand[]) => void;
	clearPendingSlashCommands: () => void;
}
