// ============================================================
// warpbridge/src/types/index.ts
// Core types. Universal — no Node or browser dependencies.
// ============================================================

// Re-export Immer types from store (needed for slice integration)
export type { ImmerSet, ImmerGet } from '../store';

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
	ATTACHMENT = 'attachment',
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
// Thread Patch — for patch-based updates to threads
// ============================================================
export interface IThreadPatch {
	title?: string;
	folderId?: TFolderId | null;
	systemPrompt?: string;
	meta?: string; // JSON blob replacement
	totalPromptTokens?: number;
	totalCompletionTokens?: number;
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
	| IMessagePartToolCall
	| IMessagePartAttachment;

export interface IMessagePartAttachment extends IMessagePartBase {
	type: EMessagePartType.ATTACHMENT;
	data: string;
	mimeType: string;
	fileName: string;
	fileSize: number;
	extractedText?: string;
}

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
	promptTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	actualTokens?: number;
	promptPerSecond?: number;
	predictedPerSecond?: number;
	promptMs?: number;
	predictedMs?: number;
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
	warpdrv?: {
		renderers?: Record<string, {
			component: string;
			propsMap?: Record<string, string>;
			props?: Record<string, unknown>;
		}>;
	};
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
	warpdrv?: IMcpServerEntry['warpdrv'];
}

// ============================================================
// Inference — completion request sent to orchestrator
// ============================================================
export interface ICompletionUserMessage {
	parentId: TMessageId | null;
	content: string;
}

export interface IToolAttachment {
	serverName: string;
	toolName: string;
}

export interface ICompletionRequest {
	threadId: TThreadId;
	userMessage?: ICompletionUserMessage;
	parentId?: TMessageId | null;
	serverId?: string;
	messages?: Array<{ role: string; content: string }>;
	systemPrompt?: string;
	inferenceParams: Record<string, unknown>;
	presetId?: string | null;
	tools?: IOpenAITool[];
	attachments?: IMessagePartAttachment[];
	generateTitle?: boolean;
	attachAllTools?: boolean;
	attachedTools?: IToolAttachment[];
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

// ============================================================
// Broadcast events — emitted by bridge for any state change
// ============================================================
export type IBridgeEvent =
	| { type: 'thread.created'; thread: IChatThread }
	| { type: 'thread.updated'; threadId: TThreadId; updates: IThreadPatch }
	| { type: 'thread.deleted'; threadId: TThreadId }
	| { type: 'message.created'; message: IChatMessage }
	| { type: 'message.patched'; messageId: TMessageId; threadId: TThreadId; updates: IMessagePatch }
	| { type: 'message.deleted'; messageId: TMessageId; threadId: TThreadId }
	| { type: 'message.chunk'; messageId: TMessageId; threadId: TThreadId; partId: TMessagePartId; partType: EMessagePartType.TEXT | EMessagePartType.REASONING; deltaText: string }
	| { type: 'tool_call.starting'; threadId: TThreadId; messageId: TMessageId; name: string }
	| { type: 'tool_call.created'; toolCall: IToolCall }
	| { type: 'tool_call.updated'; toolCall: IToolCall }
	| { type: 'inference.started'; threadId: TThreadId; messageId: TMessageId }
	| { type: 'inference.ended'; threadId: TThreadId; messageId: TMessageId }
	| { type: 'inference.error'; threadId: TThreadId; messageId: TMessageId; error: string };

export interface IMessagePatch {
	stats?: IChatMessageStats;
	addParts?: IMessagePart[];
	replaceParts?: IMessagePart[];
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
	error?: string;
	[key: string]: unknown;
}

// Message conversion utilities
export { convertMessagesToOpenAIFormat, type TOpenAIMessage } from '../messageConverter';
