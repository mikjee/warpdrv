// ============================================================
// FILE: packages/server/src/services/mcpClientManager.ts
// MCP Client Manager — connects to MCP servers, fetches tools,
// manages lifecycle, emits SSE events
// ============================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { spawn, type ChildProcess } from 'child_process';
import crypto from 'crypto';
import { readMcpConfig } from '../util/mcpConfig';
import { sseManager } from './sseManagerInstance';
import type {
	IMcpServerEntry,
	IMcpServerState,
	IMcpToolDefinition,
	IToolPermission,
	IMcpServerPermission,
} from '@warpcore/shared';
import { EMcpTransportType, EMcpServerStatus, EToolApprovalMode } from '@warpcore/shared';

// In-memory state for connected MCP servers
interface IMcpClientEntry {
	name: string;
	client: Client;
	transport: StdioClientTransport | StreamableHTTPClientTransport;
	process: ChildProcess | null; // only for stdio
	state: IMcpServerState;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
}

const clients: Record<string, IMcpClientEntry> = {};

// Get all connected MCP server states
export function getAllMcpServerStates(): Record<string, IMcpServerState> {
	const result: Record<string, IMcpServerState> = {};
	for (const [name, entry] of Object.entries(clients)) {
		result[name] = entry.state;
	}
	return result;
}

// Get a specific server state
export function getMcpServerState(name: string): IMcpServerState | null {
	return clients[name]?.state ?? null;
}

// Get all enabled tool definitions across all connected servers
// Takes permissions into account
export function getEnabledTools(
	serverPermissions: IMcpServerPermission[],
	toolPermissions: IToolPermission[],
): IMcpToolDefinition[] {
	const serverPermMap = new Map(serverPermissions.map(p => [p.serverName, p.enabled]));
	const toolPermMap = new Map(toolPermissions.map(p => [`${p.serverName}:${p.toolName}`, p]));

	const tools: IMcpToolDefinition[] = [];
	for (const [name, entry] of Object.entries(clients)) {
		if (entry.state.status !== EMcpServerStatus.CONNECTED) continue;
		// Check server-level permission (default: enabled)
		const serverEnabled = serverPermMap.get(name) ?? true;
		if (!serverEnabled) continue;

		for (const tool of entry.state.tools) {
			const perm = toolPermMap.get(`${name}:${tool.name}`);
			// Check tool-level enabled (default: true)
			const toolEnabled = perm?.enabled ?? true;
			if (!toolEnabled) continue;
			// Check if globally denied
			if (perm?.approvalMode === EToolApprovalMode.DENIED) continue;

			tools.push(tool);
		}
	}
	return tools;
}

// Get the approval mode for a specific tool
export function getToolApprovalMode(
	serverName: string,
	toolName: string,
	toolPermissions: IToolPermission[],
): EToolApprovalMode {
	const perm = toolPermissions.find(p => p.serverName === serverName && p.toolName === toolName);
	return perm?.approvalMode ?? EToolApprovalMode.ASK;
}

// Convert MCP tool definitions to OpenAI function-calling format
export function toolsToOpenAIFormat(tools: IMcpToolDefinition[]): Array<{
	type: 'function';
	function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
	return tools.map(t => ({
		type: 'function' as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.inputSchema,
		},
	}));
}

// Execute a tool call on the appropriate MCP server
export async function executeToolCall(
	serverName: string,
	toolName: string,
	args: Record<string, unknown>,
	timeoutMs?: number,
): Promise<{ content: unknown; isError: boolean }> {
	const entry = clients[serverName];
	if (!entry) throw new Error(`MCP server '${serverName}' not connected`);
	if (entry.state.status !== EMcpServerStatus.CONNECTED) {
		throw new Error(`MCP server '${serverName}' is ${entry.state.status}`);
	}

	const timeout = timeoutMs ?? 30000;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeout);

	try {
		const result = await entry.client.callTool(
			{ name: toolName, arguments: args },
			undefined,
			{ signal: controller.signal },
		);
		clearTimeout(timer);
		return {
			content: result.content,
			isError: result.isError ?? false,
		};
	} catch (err) {
		clearTimeout(timer);
		throw err;
	}
}

// Find which server owns a given tool
export function findToolServer(toolName: string): string | null {
	for (const [name, entry] of Object.entries(clients)) {
		if (entry.state.status !== EMcpServerStatus.CONNECTED) continue;
		if (entry.state.tools.some(t => t.name === toolName)) return name;
	}
	return null;
}

// Determine transport type from config entry
function getTransportType(entry: IMcpServerEntry): EMcpTransportType {
	if (entry.url) return EMcpTransportType.HTTP;
	return EMcpTransportType.STDIO;
}

// Connect to a single MCP server
async function connectServer(name: string, entry: IMcpServerEntry): Promise<void> {
	// Disconnect existing if reconnecting
	if (clients[name]) {
		await disconnectServer(name, false);
	}

	const transportType = getTransportType(entry);
	const state: IMcpServerState = {
		name,
		status: EMcpServerStatus.CONNECTING,
		transportType,
		error: null,
		tools: [],
		connectedAt: null,
	};

	const client = new Client({
		name: `warpcore-${name}`,
		version: '1.0.0',
	});

	let transport: StdioClientTransport | StreamableHTTPClientTransport;
	let childProcess: ChildProcess | null = null;

	try {
		if (transportType === EMcpTransportType.STDIO) {
			const command = entry.command!;
			const args = entry.args ?? [];
			const env = { ...process.env, ...(entry.env ?? {}) };

			transport = new StdioClientTransport({
				command,
				args,
				env,
			});
		} else {
			transport = new StreamableHTTPClientTransport(
				new URL(entry.url!),
				{
					requestInit: {
						headers: entry.headers ?? {},
					},
				},
			);
		}

		// Set state to connecting and emit
		clients[name] = {
			name,
			client,
			transport,
			process: childProcess,
			state,
			reconnectTimer: null,
		};
		emitMcpState();

		// Connect
		await client.connect(transport);

		// Fetch tools
		const toolsResult = await client.listTools();
		const tools: IMcpToolDefinition[] = (toolsResult.tools ?? []).map(t => ({
			name: t.name,
			description: t.description ?? '',
			inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
			serverName: name,
		}));

		// Update state
		state.status = EMcpServerStatus.CONNECTED;
		state.tools = tools;
		state.connectedAt = Date.now();
		state.error = null;

		console.log(`[MCP] Connected to '${name}' (${transportType}), ${tools.length} tools available`);
		emitMcpState();

		// Listen for close/error to trigger reconnect
		client.onclose = () => {
			console.log(`[MCP] Server '${name}' disconnected`);
			state.status = EMcpServerStatus.DISCONNECTED;
			state.error = 'Connection closed';
			emitMcpState();
			scheduleReconnect(name, entry);
		};

	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		console.error(`[MCP] Failed to connect to '${name}':`, errorMsg);
		state.status = EMcpServerStatus.ERROR;
		state.error = errorMsg;

		clients[name] = {
			name,
			client,
			transport: transport!,
			process: childProcess,
			state,
			reconnectTimer: null,
		};
		emitMcpState();
		scheduleReconnect(name, entry);
	}
}

// Disconnect a single MCP server
async function disconnectServer(name: string, emit: boolean = true): Promise<void> {
	const entry = clients[name];
	if (!entry) return;

	// Clear reconnect timer
	if (entry.reconnectTimer) {
		clearTimeout(entry.reconnectTimer);
		entry.reconnectTimer = null;
	}

	try {
		await entry.client.close();
	} catch {
		// ignore close errors
	}

	entry.state.status = EMcpServerStatus.DISCONNECTED;
	entry.state.tools = [];
	entry.state.connectedAt = null;

	delete clients[name];
	if (emit) emitMcpState();
}

// Schedule a reconnect after failure
function scheduleReconnect(name: string, entry: IMcpServerEntry): void {
	const clientEntry = clients[name];
	if (!clientEntry) return;
	if (clientEntry.reconnectTimer) return;

	clientEntry.reconnectTimer = setTimeout(async () => {
		console.log(`[MCP] Attempting reconnect to '${name}'...`);
		if (clientEntry.reconnectTimer) {
			clientEntry.reconnectTimer = null;
		}
		await connectServer(name, entry);
	}, 5000);
}

// Emit current MCP state over SSE
function emitMcpState(): void {
	const states = getAllMcpServerStates();
	sseManager.emit('mcp:servers', states);
}

// ============================================================
// Public API
// ============================================================

// Initialize — read config and connect to all servers
export async function initMcpClients(): Promise<void> {
	const config = readMcpConfig();
	const entries = Object.entries(config.mcpServers);

	if (entries.length === 0) {
		console.log('[MCP] No servers configured in mcp.json');
		return;
	}

	console.log(`[MCP] Connecting to ${entries.length} server(s)...`);
	for (const [name, entry] of entries) {
		await connectServer(name, entry);
	}
}

// Reload — re-read config, disconnect removed servers, connect new ones
export async function reloadMcpClients(): Promise<void> {
	const config = readMcpConfig();
	const configuredNames = new Set(Object.keys(config.mcpServers));

	// Disconnect servers that are no longer in config
	for (const name of Object.keys(clients)) {
		if (!configuredNames.has(name)) {
			console.log(`[MCP] Server '${name}' removed from config, disconnecting`);
			await disconnectServer(name);
		}
	}

	// Connect new or reconnect existing
	for (const [name, entry] of Object.entries(config.mcpServers)) {
		const existing = clients[name];
		if (!existing || existing.state.status === EMcpServerStatus.ERROR || existing.state.status === EMcpServerStatus.DISCONNECTED) {
			await connectServer(name, entry);
		}
	}
}

// Restart a specific server
export async function restartMcpServer(name: string): Promise<void> {
	const config = readMcpConfig();
	const entry = config.mcpServers[name];
	if (!entry) throw new Error(`Server '${name}' not found in mcp.json`);

	await disconnectServer(name, false);
	await connectServer(name, entry);
}

// Refresh tools for a specific server
export async function refreshMcpServerTools(name: string): Promise<void> {
	const entry = clients[name];
	if (!entry || entry.state.status !== EMcpServerStatus.CONNECTED) {
		throw new Error(`Server '${name}' is not connected`);
	}

	const toolsResult = await entry.client.listTools();
	entry.state.tools = (toolsResult.tools ?? []).map(t => ({
		name: t.name,
		description: t.description ?? '',
		inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
		serverName: name,
	}));

	emitMcpState();
}

// Shutdown all clients (for app exit)
export async function shutdownMcpClients(): Promise<void> {
	for (const name of Object.keys(clients)) {
		await disconnectServer(name, false);
	}
}
