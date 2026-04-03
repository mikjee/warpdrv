// ============================================================
// FILE: packages/shared/src/mcp-types.ts
// New file — MCP types for WarpCore
// ============================================================

import { EMcpTransportType, EMcpServerStatus, EToolApprovalMode, EToolCallStatus } from './enums';

// ============================================================
// Identifiers
// ============================================================
export type TMcpServerId = string;
export type TToolCallId = string;

// ============================================================
// MCP Server Config (stored in mcp.json)
// ============================================================

// Stdio transport — spawns a child process
export interface IMcpStdioConfig {
	command: string;
	args?: string[];
	env?: Record<string, string>;
}

// Streamable HTTP transport — connects to a remote URL
export interface IMcpHttpConfig {
	url: string;
	headers?: Record<string, string>;
}

// A single MCP server entry in mcp.json
export interface IMcpServerEntry {
	// Stdio fields (Cursor-compatible)
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	// HTTP fields
	url?: string;
	headers?: Record<string, string>;
	// Optional timeout per tool call in ms
	timeout?: number;
}

// The mcp.json file shape (Cursor-compatible)
export interface IMcpConfigFile {
	mcpServers: Record<string, IMcpServerEntry>;
}

// ============================================================
// MCP Server Runtime State (in-memory + SSE)
// ============================================================
export interface IMcpToolDefinition {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	serverName: string; // which MCP server this tool belongs to
}

export interface IMcpServerState {
	name: string; // key from mcp.json
	status: EMcpServerStatus;
	transportType: EMcpTransportType;
	error: string | null;
	tools: IMcpToolDefinition[];
	connectedAt: number | null;
}

// ============================================================
// Tool Permissions (persisted in SQLite)
// ============================================================
export interface IToolPermission {
	serverName: string;
	toolName: string;
	enabled: boolean;
	approvalMode: EToolApprovalMode;
}

export interface IMcpServerPermission {
	serverName: string;
	enabled: boolean;
}

// ============================================================
// Tool Call Records (persisted in SQLite, linked to messages)
// ============================================================
export interface IToolCall {
	id: TToolCallId;
	messageId: string; // the assistant message that triggered this
	threadId: string;
	serverName: string;
	toolName: string;
	arguments: string; // JSON string
	result: string | null; // JSON string, null if pending/denied
	status: EToolCallStatus;
	error: string | null;
	createdAt: number;
	resolvedAt: number | null;
}

// ============================================================
// API Payloads
// ============================================================

// Frontend -> backend: user sends a chat message
export interface IChatCompletionRequest {
	threadId: string;
	messages: Array<{
		role: 'system' | 'user' | 'assistant';
		content: string;
	}>;
	serverId: string;
	inferenceParams: Record<string, unknown>;
	systemPrompt?: string;
}

// Backend -> frontend: SSE events during chat completion
export interface IChatStreamEvent {
	type: 'text-delta' | 'reasoning-delta' | 'tool-call' | 'tool-result' | 'done' | 'error';
	// For text-delta / reasoning-delta
	text?: string;
	// For tool-call
	toolCall?: {
		id: TToolCallId;
		serverName: string;
		toolName: string;
		arguments: string;
		status: EToolCallStatus;
	};
	// For tool-result
	toolResult?: {
		id: TToolCallId;
		result: string;
		status: EToolCallStatus;
	};
	// For done
	metadata?: {
		promptTokens: number;
		completionTokens: number;
		reasoningTokens: number;
		ppSpeed: number;
		tgSpeed: number;
		ttftMs: number;
		totalMs: number;
	};
	// For error
	error?: string;
}

// Frontend -> backend: approve or deny a pending tool call
export interface IToolCallDecision {
	toolCallId: TToolCallId;
	decision: 'approve' | 'deny';
	// Optional: edited arguments (future feature)
	editedArguments?: string;
}
