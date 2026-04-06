// ============================================================
// warpbridge/src/types/index.ts
// Core types. Universal — no Node or browser dependencies.
// ============================================================

// ============================================================
// Identifiers
// ============================================================
export type TThreadId = string;
export type TMessageId = string;
export type TMessagePartId = string;
export type TToolCallId = string;
export type TFolderId = string;
export type TMcpServerId = string;

// ============================================================
// Enums
// ============================================================
export enum EChatRole {
	SYSTEM = 'system',
	USER = 'user',
	ASSISTANT = 'assistant',
	TOOL = 'tool',
}

export enum EMessagePartType {
	TEXT = 'text',
	REASONING = 'reasoning',
	TOOL_CALL = 'tool_call',
}

export enum EToolCallStatus {
	PENDING = 'PENDING',
	EXECUTING = 'EXECUTING',
	COMPLETED = 'COMPLETED',
	DENIED = 'DENIED',
	ERROR = 'ERROR',
}

export enum EToolApprovalMode {
	ASK = 'ASK',
	ALLOWED = 'ALLOWED',
	DENIED = 'DENIED',
}

export enum EMcpServerStatus {
	DISCONNECTED = 'DISCONNECTED',
	CONNECTING = 'CONNECTING',
	CONNECTED = 'CONNECTED',
	ERROR = 'ERROR',
}

export enum EMcpTransportType {
	STDIO = 'STDIO',
	HTTP = 'HTTP',
}

export enum EStreamStatus {
	IDLE = 'IDLE',
	STREAMING = 'STREAMING',
	TOOL_CALLING = 'TOOL_CALLING',
	WAITING_APPROVAL = 'WAITING_APPROVAL',
	ERROR = 'ERROR',
}

// ============================================================
// Folders
// ============================================================
export interface IFolder {
	id: TFolderId;
	name: string;
	parentId: TFolderId | null;
	sortOrder: number;
	createdAt: number;
}

export interface IFolderCreatePayload {
	name: string;
	parentId?: TFolderId | null;
	sortOrder?: number;
}

export interface IReorderFolderEntry {
	id: TFolderId;
	sortOrder: number;
}

// ============================================================
// Threads
// Column names mirror WarpCore's `threads` table.
// `meta` is a JSON blob for consumer-specific fields (e.g. serverId, tags).
// ============================================================
export interface IChatThread {
	id: TThreadId;
	title: string;
	folderId: TFolderId | null;
	systemPrompt: string;
	meta: string; // JSON blob — opaque to bridge
	totalPromptTokens: number;
	totalCompletionTokens: number;
	createdAt: number;
	updatedAt: number;
}

export interface IChatThreadCreatePayload {
	id?: TThreadId;
	title?: string;
	folderId?: TFolderId | null;
	systemPrompt?: string;
	meta?: string;
}

export interface IListThreadsOptions {
	query?: string;
	folderId?: TFolderId | null;
}

// ============================================================
// Thread Config
// Mirrors WarpCore's `thread_configs` table.
// `params` is a JSON string storing inference parameters — bridge does not
// interpret its shape, consumer owns it.
// ============================================================
export interface IThreadConfig {
	threadId: TThreadId;
	presetId: string | null;
	systemPrompt: string;
	params: string; // JSON string
}

// ============================================================
// Messages
// Content is an ordered array of typed parts, stored in message_parts.
// ============================================================
export interface IChatMessage {
	id: TMessageId;
	parentId: TMessageId | null; // Parent message for branching (regen, edits)
	threadId: TThreadId;
	role: EChatRole;
	content: IMessagePart[];
	stats: IChatMessageStats | null;
	createdAt: number;
}

export interface IChatMessageCreatePayload {
	id?: TMessageId;
	parentId?: TMessageId | null;
	role: EChatRole;
	content: IMessagePart[];
	stats?: string; // JSON string of IChatMessageStats
}

export type IMessagePart =
	| IMessagePartText
	| IMessagePartReasoning
	| IMessagePartToolCall;

export interface IMessagePartBase {
	id: TMessagePartId;
	type: EMessagePartType;
	orderIndex: number;
}

export interface IMessagePartText extends IMessagePartBase {
	type: EMessagePartType.TEXT;
	text: string;
}

export interface IMessagePartReasoning extends IMessagePartBase {
	type: EMessagePartType.REASONING;
	text: string;
}

export interface IMessagePartToolCall extends IMessagePartBase {
	type: EMessagePartType.TOOL_CALL;
	toolCallId: TToolCallId;
}

export interface IChatMessageStats {
	promptTokens: number;
	completionTokens: number;
	reasoningTokens: number;
	promptPerSecond: number;
	predictedPerSecond: number;
	promptMs: number;
	predictedMs: number;
}

// ============================================================
// Tool Calls
// Column names mirror WarpCore's `tool_calls` table.
// ============================================================
export interface IToolCall {
	id: TToolCallId;
	messageId: TMessageId;
	threadId: TThreadId;
	serverName: string;
	toolName: string;
	arguments: string; // JSON string
	result: string | null;
	status: EToolCallStatus;
	error: string | null;
	createdAt: number;
	resolvedAt: number | null;
}

// ============================================================
// Tool Definitions (from MCP servers)
// ============================================================
export interface IToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	serverName: string;
}

// ============================================================
// Permissions
// Column names mirror WarpCore's mcp_server_permissions / mcp_tool_permissions.
// ============================================================
export interface IServerPermission {
	serverName: string;
	enabled: boolean;
}

export interface IToolPermission {
	serverName: string;
	toolName: string;
	enabled: boolean;
	approvalMode: EToolApprovalMode;
}

// ============================================================
// MCP Server
// ============================================================
export interface IMcpServerEntry {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	timeout?: number;
}

export interface IMcpConfigFile {
	mcpServers: Record<string, IMcpServerEntry>;
}

export interface IMcpServerState {
	name: string;
	status: EMcpServerStatus;
	transportType: EMcpTransportType;
	error: string | null;
	tools: IToolDefinition[];
	connectedAt: number | null;
}

// ============================================================
// Inference — completion request sent to orchestrator
// ============================================================
export interface ICompletionUserMessage {
	id: TMessageId;
	parentId: TMessageId | null;
	content: string;
}

export interface ICompletionRequest {
	threadId: TThreadId;
	userMessage?: ICompletionUserMessage; // absent = regen
	serverId?: string;
	messages: Array<{ role: string; content: string }>;
	systemPrompt?: string;
	inferenceParams: Record<string, unknown>;
	tools?: IOpenAITool[];
}

// ============================================================
// OpenAI-compatible wire format
// ============================================================
export interface IOpenAITool {
	type: 'function';
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface IOpenAIToolCall {
	id: string;
	type: 'function';
	function: {
		name: string;
		arguments: string;
	};
}

export interface ISSEChunk {
	choices?: Array<{
		index: number;
		delta?: {
			content?: string;
			reasoning_content?: string;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: string;
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason?: string | null;
	}>;
	timings?: Record<string, number>;
	usage?: Record<string, number>;
	warpcore_event?: string;
	[key: string]: unknown;
}
