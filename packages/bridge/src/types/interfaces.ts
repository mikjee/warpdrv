// ============================================================
// warpbridge/src/types/interfaces.ts
// Contracts for replaceable components.
// Universal — no Node or browser dependencies.
// ============================================================
import type {
	TThreadId,
	TMessageId,
	TMessagePartId,
	TToolCallId,
	TFolderId,
	IFolder,
	IReorderFolderEntry,
	IChatThread,
	IListThreadsOptions,
	IThreadConfig,
	IChatMessage,
	IMessagePart,
	IToolCall,
	IToolDefinition,
	IToolAttachment,
	IServerPermission,
	IToolPermission,
	IThreadToolPermission,
	IMcpServerState,
	IMcpConfigFile,
	IMcpServerEntry,
	ICompletionRequest,
	ISSEChunk,
	EToolApprovalMode,
	EToolCallStatus,
	IBridgeEvent,
} from './index';

// ============================================================
// Persistence — storage for folders, threads, messages, tool calls, permissions
// ============================================================
export interface IPersistence {
	// Lifecycle
	init(): Promise<void>;

	// Folders
	createFolder(folder: IFolder): Promise<void>;
	getFolder(id: TFolderId): Promise<IFolder | null>;
	listFolders(): Promise<IFolder[]>;
	updateFolder(id: TFolderId, updates: Partial<IFolder>): Promise<void>;
	deleteFolder(id: TFolderId): Promise<void>;
	reorderFolders(entries: IReorderFolderEntry[]): Promise<void>;

	// Threads
	createThread(thread: IChatThread): Promise<void>;
	getThread(id: TThreadId): Promise<IChatThread | null>;
	listThreads(options?: IListThreadsOptions): Promise<IChatThread[]>;
	updateThread(id: TThreadId, updates: Partial<IChatThread>): Promise<void>;
	deleteThread(id: TThreadId): Promise<void>;
	incrementThreadTokens(id: TThreadId, promptDelta: number, completionDelta: number): Promise<void>;

	// Thread Configs
	getThreadConfig(threadId: TThreadId): Promise<IThreadConfig | null>;
	setThreadConfig(config: IThreadConfig): Promise<void>;
	deleteThreadConfig(threadId: TThreadId): Promise<void>;

	// Messages (content persisted as ordered parts)
	createMessage(message: IChatMessage): Promise<void>;
	getMessages(threadId: TThreadId): Promise<IChatMessage[]>;
	getMessage(id: TMessageId): Promise<IChatMessage | null>;
	updateMessage(id: TMessageId, updates: Partial<Pick<IChatMessage, 'stats'>>): Promise<void>;
	replaceMessageParts(messageId: TMessageId, parts: IMessagePart[]): Promise<void>;
	appendMessagePart(messageId: TMessageId, part: IMessagePart): Promise<void>;
	deleteMessage(id: TMessageId): Promise<void>;

	// Tool calls
	createToolCall(toolCall: IToolCall): Promise<void>;
	updateToolCall(id: TToolCallId, updates: Partial<IToolCall>): Promise<void>;
	getToolCall(id: TToolCallId): Promise<IToolCall | null>;
	getToolCallsForThread(threadId: TThreadId): Promise<IToolCall[]>;
	getToolCallsForMessage(messageId: TMessageId): Promise<IToolCall[]>;
	getPendingToolCalls(): Promise<IToolCall[]>;

	// Permissions — servers
	getServerPermission(serverName: string): Promise<IServerPermission | null>;
	setServerPermission(serverName: string, enabled: boolean): Promise<void>;
	getAllServerPermissions(): Promise<IServerPermission[]>;

	// Permissions — tools
	getToolPermission(serverName: string, toolName: string): Promise<IToolPermission | null>;
	setToolPermission(serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void>;
	getAllToolPermissions(): Promise<IToolPermission[]>;

	// Permissions — thread-level tool overrides
	getThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string): Promise<IThreadToolPermission | null>;
	setThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void>;
	deleteThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string): Promise<void>;
	getAllThreadToolPermissions(threadId: TThreadId): Promise<IThreadToolPermission[]>;

	// Thread attached tools
	saveThreadAttachedTools(threadId: TThreadId, attachAllTools: boolean, tools: IToolAttachment[]): Promise<void>;
	getThreadAttachedTools(threadId: TThreadId): Promise<{ attachAllTools: boolean; tools: IToolAttachment[] } | null>;
}

// ============================================================
// Transport — how the frontend talks to the backend
// ============================================================
export interface ITransport {
	startCompletion(request: ICompletionRequest): AsyncIterable<ISSEChunk>;
	cancelCompletion(threadId: TThreadId): void;
	approveToolCall(id: TToolCallId): Promise<{ status: EToolCallStatus; result?: string }>;
	denyToolCall(id: TToolCallId): Promise<{ status: EToolCallStatus }>;
}

// ============================================================
// MCP Client — connects to MCP servers and executes tools
// ============================================================
export interface IMcpClient {
	connect(name: string, entry: IMcpServerEntry): Promise<void>;
	disconnect(name: string): Promise<void>;
	reconnect(name: string): Promise<void>;
	disconnectAll(): Promise<void>;
	getServerState(name: string): IMcpServerState | null;
	getAllServerStates(): Record<string, IMcpServerState>;
	getTools(name: string): IToolDefinition[];
	getAllTools(): IToolDefinition[];
	executeToolCall(serverName: string, toolName: string, args: Record<string, unknown>, threadId?: string): Promise<{ content: unknown; isError: boolean }>;
	findToolServer(toolName: string): string | null;
}

// ============================================================
// MCP Config — reads/writes the mcp.json file
// ============================================================
export interface IMcpConfig {
	read(): IMcpConfigFile;
	write(config: IMcpConfigFile): void;
	getPath(): string;
	addServer(name: string, entry: IMcpServerEntry): IMcpConfigFile;
	removeServer(name: string): IMcpConfigFile;
	updateServer(name: string, entry: IMcpServerEntry): IMcpConfigFile;
}

// ============================================================
// Permissions Manager — combines persistence + tool filtering
// ============================================================
export interface IPermissions {
	isServerEnabled(serverName: string): Promise<boolean>;
	getToolApprovalMode(threadId: TThreadId | undefined, serverName: string, toolName: string): Promise<EToolApprovalMode>;
	getEnabledTools(threadId: TThreadId | undefined, allTools: IToolDefinition[]): Promise<IToolDefinition[]>;
	setServerEnabled(serverName: string, enabled: boolean): Promise<void>;
	setToolPermission(serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void>;
}

// ============================================================
// Events — push-based state sync (MCP status, tool call updates)
// ============================================================
export interface IBridgeEvents {
	onMcpServersChanged(callback: (servers: Record<string, IMcpServerState>) => void): () => void;
	onToolCallUpdated(callback: (toolCall: IToolCall) => void): () => void;
	onPendingApproval(callback: (toolCall: IToolCall) => void): () => void;
}

// ============================================================
// Bridge Broadcaster — fan out state changes to subscribers
// ============================================================
export interface IBridgeBroadcaster {
	emit(event: IBridgeEvent): void;
	subscribe(handler: (event: IBridgeEvent) => void): () => void;
	// Optional native handle for transport-specific implementations
	// (e.g. better-sse Channel) — consumers can use this to register
	// HTTP sessions directly without going through subscribe.
	getNative?(): unknown;
}