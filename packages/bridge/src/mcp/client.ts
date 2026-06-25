// ============================================================
// warpbridge/src/mcp/client.ts
// MCP Client Manager — connects to servers, manages lifecycle.
// Node only — uses child processes for stdio transport.
// ============================================================

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import type { IMcpClient } from '../types/interfaces';
import type { IBridgeBroadcaster } from '../types/interfaces';
import type { IMcpServerEntry, IMcpServerState, IToolDefinition } from '../types';
import { EMcpServerStatus, EMcpTransportType } from '../types';
import { ElicitationRegistry } from './elicitationRegistry';

interface IClientEntry {
	name: string;
	client: Client;
	transport: StdioClientTransport | StreamableHTTPClientTransport;
	state: IMcpServerState;
	reconnectTimer: ReturnType<typeof setTimeout> | null;
	config: IMcpServerEntry;
	wasConnected: boolean;
	_disconnecting: boolean;
}

export class McpClientManager implements IMcpClient {
	private clients: Record<string, IClientEntry> = {};
	private onChange?: (servers: Record<string, IMcpServerState>) => void;
	private broadcaster?: IBridgeBroadcaster;
	public readonly elicitationRegistry: ElicitationRegistry;

	constructor(onChange?: (servers: Record<string, IMcpServerState>) => void, broadcaster?: IBridgeBroadcaster) {
		this.onChange = onChange;
		this.broadcaster = broadcaster;
		this.elicitationRegistry = new ElicitationRegistry();
	}

	private emitChange(): void {
		this.onChange?.(this.getAllServerStates());
	}

	private getTransportType(entry: IMcpServerEntry): EMcpTransportType {
		return entry.url ? EMcpTransportType.HTTP : EMcpTransportType.STDIO;
	}

	async connect(name: string, entry: IMcpServerEntry): Promise<void> {
		if (this.clients[name]) await this.disconnect(name);

		const transportType = this.getTransportType(entry);
		const state: IMcpServerState = {
			name,
			status: EMcpServerStatus.CONNECTING,
			transportType,
			error: null,
			tools: [],
			connectedAt: null,
			warpdrv: entry.warpdrv,
		};

		const client = new Client(
			{ name: `warpbridge-${name}`, version: '1.0.0' },
			{ capabilities: { elicitation: { form: {}, url: {} } } },
		);
		client.setRequestHandler(ElicitRequestSchema, async (req) => {
			const id = randomUUID();
			const promise = this.elicitationRegistry.register(id, name);
			this.broadcaster?.emit({
				type: 'elicitation_request',
				threadId: this.activeThreadByServer[name] ?? '',
				request: {
					id,
					serverName: name,
					message: req.params.message,
					mode: (req.params.mode as 'form' | 'url' | undefined) ?? 'form',
					url: req.params.url as string | undefined,
					requestedSchema: req.params.requestedSchema as Record<string, unknown> | undefined,
				},
			});
			const response = await promise;
			return response;
		});
		let transport: StdioClientTransport | StreamableHTTPClientTransport;
		let stdioEnv: Record<string, string> | null = null;
		try {
			if (transportType === EMcpTransportType.STDIO) {
				stdioEnv = {};
				for (const [k, v] of Object.entries(process.env)) {
					if (v !== undefined) stdioEnv[k] = v;
				}
				if (entry.env) {
					for (const [k, v] of Object.entries(entry.env)) {
						if (v !== undefined) stdioEnv[k] = v;
					}
				}
				// console.log(`[MCP] Spawning '${name}':`, {
				// 	command: entry.command!,
				// 	args: entry.args ?? [],
				// 	path: stdioEnv.PATH || '(not set)',
				// });
				transport = new StdioClientTransport({
					command: entry.command!,
					args: entry.args ?? [],
					env: stdioEnv,
				});
			} else {
				const headers: Record<string, string> = {};
				if (entry.headers) {
					for (const [k, v] of Object.entries(entry.headers)) {
						if (v !== undefined) headers[k] = v;
					}
				}
				transport = new StreamableHTTPClientTransport(
					new URL(entry.url!),
					{ requestInit: { headers } },
				);
			}

			this.clients[name] = { name, client, transport, state, reconnectTimer: null, config: entry, wasConnected: false, _disconnecting: false };
			this.emitChange();

			await client.connect(transport);

			const toolsResult = await client.listTools();
			state.tools = (toolsResult.tools ?? []).map(t => {
				const schema = { ...(t.inputSchema ?? {}) } as Record<string, unknown>;
				delete schema['$schema'];
				return {
					name: t.name,
					description: t.description ?? '',
					inputSchema: schema,
					serverName: name,
				};
			});
			state.status = EMcpServerStatus.CONNECTED;
			state.connectedAt = Date.now();
			state.error = null;
			const ce = this.clients[name];
			if (ce) ce.wasConnected = true;
			this.emitChange();

			client.onclose = () => {
				const ce = this.clients[name];
				if (!ce || ce._disconnecting) return;
				state.status = EMcpServerStatus.DISCONNECTED;
				state.error = 'Connection closed';
				this.emitChange();
				if (ce.wasConnected) {
					this.scheduleReconnect(name);
				}
			};
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			console.error(`[MCP] Failed to connect '${name}':`, errorMsg);
			if (transportType === EMcpTransportType.STDIO) {
				console.error(`[MCP]   Command: ${entry.command ?? 'N/A'}`);
				console.error(`[MCP]   Args: ${JSON.stringify(entry.args ?? [])}`);
				console.error(`[MCP]   PATH: ${stdioEnv?.PATH || '(not set)'}`);
			}
			state.status = EMcpServerStatus.ERROR;
			state.error = errorMsg;
			this.clients[name] = { name, client, transport: transport!, state, reconnectTimer: null, config: entry, wasConnected: false, _disconnecting: false };
			this.emitChange();
		}
	}

	async disconnect(name: string): Promise<void> {
		const entry = this.clients[name];
		if (!entry) return;
		if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
		entry._disconnecting = true;
		const cancelled = this.elicitationRegistry.cancelAllForServer(name);
		for (const id of cancelled) {
			this.broadcaster?.emit({ type: 'elicitation_resolved', id });
		}
		try { await entry.client.close(); } catch { /* ignore */ }
		delete this.clients[name];
		this.emitChange();
	}

	async reconnect(name: string): Promise<void> {
		const entry = this.clients[name];
		if (!entry) throw new Error(`Server '${name}' not found`);
		await this.connect(name, entry.config);
	}

	async disconnectAll(): Promise<void> {
		for (const name of Object.keys(this.clients)) {
			await this.disconnect(name);
		}
	}

	private scheduleReconnect(name: string): void {
		const entry = this.clients[name];
		if (!entry || entry.reconnectTimer) return;
		entry.reconnectTimer = setTimeout(async () => {
			entry.reconnectTimer = null;
			await this.connect(name, entry.config);
		}, 5000);
	}

	getServerState(name: string): IMcpServerState | null {
		return this.clients[name]?.state ?? null;
	}

	getAllServerStates(): Record<string, IMcpServerState> {
		const result: Record<string, IMcpServerState> = {};
		for (const [name, entry] of Object.entries(this.clients)) {
			result[name] = entry.state;
		}
		return result;
	}

	getTools(name: string): IToolDefinition[] {
		return this.clients[name]?.state.tools ?? [];
	}

	getAllTools(): IToolDefinition[] {
		const tools: IToolDefinition[] = [];
		for (const entry of Object.values(this.clients)) {
			if (entry.state.status === EMcpServerStatus.CONNECTED) {
				tools.push(...entry.state.tools);
			}
		}
		return tools;
	}

	private activeThreadByServer: Record<string, string> = {};

	async executeToolCall(
		serverName: string,
		toolName: string,
		args: Record<string, unknown>,
		threadId?: string,
	): Promise<{ content: unknown; isError: boolean }> {
		if (threadId) this.activeThreadByServer[serverName] = threadId;
		const entry = this.clients[serverName];
		if (!entry) throw new Error(`MCP server '${serverName}' not connected`);
		if (entry.state.status !== EMcpServerStatus.CONNECTED) {
			throw new Error(`MCP server '${serverName}' is ${entry.state.status}`);
		}

		const timeout = entry.config.timeout ?? 30000;
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

		try {
			const result = await entry.client.callTool(
				{ name: toolName, arguments: args },
				undefined,
				{ signal: controller.signal },
			);
			clearTimeout(timer);
			return { content: result.content, isError: Boolean(result.isError) };
		} catch (err) {
			clearTimeout(timer);
			const cancelled = this.elicitationRegistry.cancelAllForServer(serverName);
			for (const id of cancelled) {
				this.broadcaster?.emit({ type: 'elicitation_resolved', id });
			}
			throw err;
		}
	}

	findToolServer(toolName: string): string | null {
		for (const [name, entry] of Object.entries(this.clients)) {
			if (entry.state.status !== EMcpServerStatus.CONNECTED) continue;
			if (entry.state.tools.some(t => t.name === toolName)) return name;
		}
		return null;
	}

	prepareToolArgs(
		serverName: string,
		toolName: string,
		args: Record<string, unknown>,
		wsVars: Record<string, unknown> | null,
	): Record<string, unknown> {
		const entry = this.clients[serverName];
		if (!entry) return args;

		// Merge arg defaults from warpdrv config
		const defaults = entry.config.warpdrv?.argDefaults?.[toolName];
		const merged = { ...defaults, ...args };

		// Interpolate {{ws.<key>}} in all string values
		if (!wsVars) return merged;
		return this.interpolateArgs(merged, wsVars);
	}

	private interpolateArgs(args: Record<string, unknown>, wsVars: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(args)) {
			if (typeof value === 'string') {
				result[key] = value.replace(/\{\{ws\.(\w+)\}\}/g, (_match, wsKey) => {
					const resolved = wsVars[wsKey];
					return resolved !== undefined ? String(resolved) : `{{ws.${wsKey}}}`;
				});
			} else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
				result[key] = this.interpolateArgs(value as Record<string, unknown>, wsVars);
			} else {
				result[key] = value;
			}
		}
		return result;
	}
}
