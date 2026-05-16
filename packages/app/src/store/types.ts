import type React from 'react';
import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, IDevice, TBackendId, IBackend, TBackendGroupId, IBackendGroup, TRecipeId, IRecipe, IRecipeRunState, TStepId, IServerSlotsState, ICheckpoint, TCheckpointId, TModelId, IModel, ISettings, TWhisperBackendId, IWhisperBackend, TWhisperServerId, IWhisperServer, IWhisperModel, IHardwareInfo, IBackendAsset, IKokoroStatus } from '@warpcore/shared';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';
export { type ImmerSet, type ImmerGet } from '@warpcore/bridge';

export type TCanRenderResult = Record<string, unknown> | false;

export interface IToolCallRenderer {
	component: React.ComponentType<any>;
	keywords: string[];
	canRender: (args: Record<string, unknown>) => TCanRenderResult;
}

export type TCanRenderResult = Record<string, unknown> | false;

export interface IToolCallRenderer {
	component: React.ComponentType<any>;
	keywords: string[];
	canRender: (args: Record<string, unknown>) => TCanRenderResult;
}
import type {
	IMcpServerState,
	IToolPermission,
	IToolAttachment,
	IServerPermission as IMcpServerPermission,
	IFolder,
	IChatThread,
	IChatMessage,
	IToolCall,
	IThreadPatch,
	IMessagePatch,
	TThreadId,
	TMessageId,
	TMessagePartId,
	TToolCallId,
	IElicitationRequest,
} from '@warpcore/bridge';

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
	tempThreadWhisperServerId: string | null;
	setTempThreadWhisperServerId: (id: string | null) => void;

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
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setPermissions: (serverPerms: IMcpServerPermission[], toolPerms: IToolPermission[]) => void;
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
}
