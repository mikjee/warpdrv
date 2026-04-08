// ============================================================
// FILE: packages/app/src/api/mcpServices.ts
// Frontend API service functions for MCP endpoints.
// Import and use alongside your existing services.ts
// ============================================================

import type { IMcpConfigFile, IMcpServerEntry } from '@warpcore/shared';
import type {
	IMcpServerState,
	IToolPermission,
	IServerPermission as IMcpServerPermission,
	IToolCall,
	EToolApprovalMode,
} from '@warpcore/bridge';

const API_BASE = '';

async function json<T>(url: string, opts?: RequestInit): Promise<{ ok: boolean; data: T; error: string | null }> {
	const res = await fetch(`${API_BASE}${url}`, {
		headers: { 'Content-Type': 'application/json' },
		...opts,
	});
	return res.json();
}

// ============================================================
// Config
// ============================================================
export function fetchMcpConfig() {
	return json<IMcpConfigFile>('/api/mcp/config');
}

export function updateMcpConfig(config: IMcpConfigFile) {
	return json<IMcpConfigFile>('/api/mcp/config', {
		method: 'PUT',
		body: JSON.stringify(config),
	});
}

export function fetchMcpConfigPath() {
	return json<string>('/api/mcp/config/path');
}

// ============================================================
// Server entries
// ============================================================
export function addMcpServer(name: string, entry: IMcpServerEntry) {
	return json<IMcpConfigFile>('/api/mcp/servers', {
		method: 'POST',
		body: JSON.stringify({ name, ...entry }),
	});
}

export function updateMcpServerEntry(name: string, entry: IMcpServerEntry) {
	return json<IMcpConfigFile>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
		method: 'PUT',
		body: JSON.stringify(entry),
	});
}

export function removeMcpServerEntry(name: string) {
	return json<IMcpConfigFile>(`/api/mcp/servers/${encodeURIComponent(name)}`, {
		method: 'DELETE',
	});
}

// ============================================================
// Server lifecycle
// ============================================================
export function fetchMcpStatus() {
	return json<Record<string, IMcpServerState>>('/api/mcp/status');
}

export function restartMcpServer(name: string) {
	return json<null>(`/api/mcp/servers/${encodeURIComponent(name)}/restart`, {
		method: 'POST',
	});
}

export function refreshMcpServerTools(name: string) {
	return json<null>(`/api/mcp/servers/${encodeURIComponent(name)}/refresh`, {
		method: 'POST',
	});
}

export function reloadMcpServers() {
	return json<null>('/api/mcp/reload', { method: 'POST' });
}

// ============================================================
// Permissions
// ============================================================
export function fetchMcpPermissions() {
	return json<{ servers: IMcpServerPermission[]; tools: IToolPermission[] }>('/api/mcp/permissions');
}

export function setMcpServerPermission(serverName: string, enabled: boolean) {
	return json<null>(`/api/mcp/permissions/server/${encodeURIComponent(serverName)}`, {
		method: 'PUT',
		body: JSON.stringify({ enabled }),
	});
}

export function setMcpToolPermission(
	serverName: string,
	toolName: string,
	enabled: boolean,
	approvalMode: EToolApprovalMode,
) {
	return json<null>('/api/mcp/permissions/tool', {
		method: 'PUT',
		body: JSON.stringify({ serverName, toolName, enabled, approvalMode }),
	});
}

// ============================================================
// Tool call approvals
// ============================================================
export function decideMcpToolCall(
	decision: 'approve' | 'deny',
	threadId: string,
	serverId: string,
	messages?: Array<{ role: string; content: string }>,
	systemPrompt?: string,
	inferenceParams?: Record<string, unknown>,
) {
	return json<null>('/api/chat/tool-calls/resume', {
		method: 'POST',
		body: JSON.stringify({
			decision,
			threadId,
			serverId,
			messages,
			systemPrompt,
			inferenceParams,
		}),
	});
}

export function fetchPendingToolCalls() {
	return json<IToolCall[]>('/api/mcp/tool-calls/pending');
}

export function fetchThreadToolCalls(threadId: string) {
	return json<IToolCall[]>(`/api/mcp/tool-calls/thread/${threadId}`);
}
