import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import {
	buildServerArgs,
	spawnServer,
	killServer,
	isProcessAlive,
	getServerLogs,
	clearServerLogs,
} from '../services/processManager';
import { getServerStats } from '../services/statsPoller';
import { clearStickyRoute, getStickyRoutesResolved } from '../services/modelProxy';
import { sseManager } from '../services/sseManagerInstance';
import { getCachedModels } from './models';

/**
 * Parse CLI flags into a map, handling quoted values and various formats
 */
function parseCliFlags(flags: string): Map<string, string | true> {
	const result = new Map<string, string | true>();
	
	if (!flags?.trim()) return result;
	
	// Tokenize respecting quotes
	const tokens: string[] = [];
	let current = '';
	let inQuote = false;
	let quoteChar = '';
	
	for (let i = 0; i < flags.length; i++) {
		const char = flags[i];
		
		if (!inQuote && (char === '"' || char === "'")) {
			inQuote = true;
			quoteChar = char;
		} else if (inQuote && char === quoteChar) {
			inQuote = false;
			quoteChar = '';
		} else if (!inQuote && char === ' ') {
			if (current) {
				tokens.push(current);
				current = '';
			}
		} else {
			current += char;
		}
	}
	if (current) tokens.push(current);
	
	// Parse tokens into flags
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		
		if (token.startsWith('--')) {
			// Check for --key=value format
			const equalsIndex = token.indexOf('=');
			if (equalsIndex !== -1) {
				const key = token.substring(0, equalsIndex);
				const value = token.substring(equalsIndex + 1);
				result.set(key, value);
			} else {
				// Check if next token is a value (not another flag)
				const nextToken = tokens[i + 1];
				if (nextToken && typeof nextToken === 'string' && !nextToken.startsWith('--')) {
					result.set(token, nextToken);
					i++; // Skip the value token
				} else {
					// Boolean flag
					result.set(token, true);
				}
			}
		}
	}
	
	return result;
}

/**
 * Merge CLI flags with override flags taking precedence
 */
function mergeCliFlags(baseFlags: string, overrideFlags: string): string {
	const merged = parseCliFlags(baseFlags);
	const overrides = parseCliFlags(overrideFlags);
	
	// Apply overrides
	overrides.forEach((value, key) => {
		merged.set(key, value);
	});
	
	// Reconstruct CLI string
	const parts: string[] = [];
	merged.forEach((value, key) => {
		if (value === true) {
			parts.push(key); // Boolean flag
		} else {
			// Check if value needs quoting (contains spaces or is JSON)
			const needsQuoting = value.includes(' ') || value.startsWith('{') || value.startsWith('[');
			if (needsQuoting) {
				parts.push(key, `"${value}"`);
			} else {
				parts.push(key, value);
			}
		}
	});
	
	return parts.join(' ');
}
import type {
	IServer,
	IServerCreatePayload,
	IBackend,
	IBackendGroup,
	ISettings,
} from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const PREFIX = 'servers:';
const SETTINGS_KEY = 'settings:general';

// Track used ports to avoid collisions
const usedPorts = new Set<number>();

export const serversRouter = Router();

async function findAvailablePort(): Promise<number> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	for (let port = settings.portRangeStart; port <= settings.portRangeEnd; port++) {
		if (!usedPorts.has(port)) {
			usedPorts.add(port);
			return port;
		}
	}
	throw new Error('No available ports in configured range');
}

// On startup, reconcile stored servers with actual running processes
export async function reconcileServers(): Promise<void> {
	const servers = await store.list<IServer>(PREFIX);
	for (const server of servers) {
		if (server.status === EServerStatus.RUNNING || server.status === EServerStatus.LOADING) {
			if (server.pid && isProcessAlive(server.pid)) {
				usedPorts.add(server.port);
			} else {
				server.status = EServerStatus.STOPPED;
				server.pid = undefined;
				await store.put(PREFIX + server.id, server);
			}
		}
	}
}

// Launch servers with autoLaunch=true that are not already running
export async function launchAutoStartServers(): Promise<void> {
	const servers = await store.list<IServer>(PREFIX);
	for (const server of servers) {
		if ((server.autoLaunch ?? false) && server.status === EServerStatus.STOPPED) {
			const backend = await store.get<IBackend>('backends:' + server.backendId);
			if (!backend) {
				console.log(`[WarpCore] Skipping auto-launch for ${server.serverName}: backend not found`);
				continue;
			}

			const model = getCachedModels().find(m => m.primaryFile?.filePath === server.modelPath);
			const mmprojPath = model?.mmprojFile?.filePath && server.useMultiModal ? model.mmprojFile.filePath : null;
			
			// Append recommended inference params to extraArgs if enabled
			const launchParams = { ...server.params };
			if (server.useRecommendedInferenceParams && model?.recommendedInferenceParams) {
				launchParams.extraArgs = mergeCliFlags(model.recommendedInferenceParams, server.params.extraArgs);
			}
			
			// Auto-assign port if params.port is 0
			if (launchParams.port === 0) {
				server.port = await findAvailablePort();
				launchParams.port = server.port;
			} else {
				// User-assigned port: track it
				usedPorts.add(server.port);
			}
			
			const args = await buildServerArgs(
				server.modelPath,
				mmprojPath,
				launchParams,
				backend.defaultArgs,
			);

			const pid = spawnServer(
				server.id,
				backend.path,
				args,
				async (status, error) => {
					server.status = status;
					if (error) server.error = error;
					if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
					await store.put(PREFIX + server.id, server);
				},
			);

			server.pid = pid || undefined;
			server.status = EServerStatus.LOADING;
			server.error = null;
			await store.put(PREFIX + server.id, server);
			console.log(`[WarpCore] Auto-launching server: ${server.serverName}`);
		}
	}
}

// GET /api/servers
serversRouter.get('/', async (_req, res) => {
	const servers = await store.list<IServer>(PREFIX);
	const withStats = servers.map(s => ({ ...s, stats: (s.status === EServerStatus.RUNNING || s.status === EServerStatus.LOADING) ? getServerStats(s.id) : null }));
	res.json({ ok: true, data: withStats, total: withStats.length, error: null });
});

// GET /api/servers/:id
serversRouter.get('/:id', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}
	res.json({ ok: true, data: server, error: null });
});

// POST /api/servers — launch a new server
serversRouter.post('/', async (req, res) => {
	const payload = req.body as IServerCreatePayload;

	// Use backendGroupId if provided, otherwise use backendId
	let backend: IBackend | null = null;
	if (payload.backendGroupId) {
		const group = await store.get<IBackendGroup>('backendGroups:' + payload.backendGroupId);
		if (!group) {
			res.status(400).json({ ok: false, data: null, error: 'Backend group not found' });
			return;
		}
		backend = await store.get<IBackend>('backends:' + group.activeBackendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Active backend in group not found' });
			return;
		}
	} else if (payload.backendId) {
		backend = await store.get<IBackend>('backends:' + payload.backendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
			return;
		}
	} else {
		res.status(400).json({ ok: false, data: null, error: 'Either backendId or backendGroupId is required' });
		return;
	}

	// Assign port for server.port, but keep params.port as-is (0 = auto-assign on every launch)
	const serverPort = payload.params.port > 0
		? payload.params.port
		: await findAvailablePort();

	// Track user-assigned port (auto-assigned is already tracked by findAvailablePort)
	if (payload.params.port > 0) {
		usedPorts.add(serverPort);
	}

	const id = crypto.randomBytes(6).toString('hex');

	// Generate server name from model filename if not provided
	const serverName = payload.serverName ?? payload.modelPath.split('/').pop()?.replace('.gguf', '') ?? 'server';

	const server: IServer = {
		id,
		backendId: payload.backendId,
		backendGroupId: payload.backendGroupId,
		modelPath: payload.modelPath,
		serverName,
		serverAlias: payload.serverAlias ?? [],
		params: payload.params,
		port: serverPort,
		pid: undefined,
		status: EServerStatus.STOPPED,
		startedAt: null,
		error: null,
		stats: null,
		autoLaunch: payload.autoLaunch ?? false,
		autoSaveCheckpointOnStop: payload.autoSaveCheckpointOnStop ?? false,
		autoLoadCheckpointOnStart: payload.autoLoadCheckpointOnStart ?? false,
		useRecommendedInferenceParams: payload.useRecommendedInferenceParams,
		useMultiModal: payload.useMultiModal ?? false,
	};

	// Build args and spawn
	const model = getCachedModels().find(m => m.primaryFile?.filePath === payload.modelPath);
	const mmprojPath = model?.mmprojFile?.filePath && payload.useMultiModal ? model.mmprojFile.filePath : null;
	
	// Append recommended inference params to extraArgs if enabled
	const launchParams = { ...server.params };
	if (payload.useRecommendedInferenceParams && model?.recommendedInferenceParams) {
		launchParams.extraArgs = mergeCliFlags(model.recommendedInferenceParams, server.params.extraArgs);
	}
	
	// Override port if auto-assign (0)
	if (launchParams.port === 0) {
		launchParams.port = server.port;
	}
	
	const args = await buildServerArgs(
		payload.modelPath,
		mmprojPath,
		launchParams,
		backend.defaultArgs,
	);

	const pid = spawnServer(
		id,
		backend.path,
		args,
		async (status, error) => {
			server.status = status;
			if (error) server.error = error;
			if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
			await store.put(PREFIX + id, server);
		},
	) || undefined;

	server.pid = pid;
	server.status = EServerStatus.LOADING;
	await store.put(PREFIX + id, server);

	res.status(201).json({ ok: true, data: server, error: null });
});

// POST /api/servers/:id/stop
serversRouter.post('/:id/stop', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	await killServer(server.id, server.pid);
	usedPorts.delete(server.port);

	server.status = EServerStatus.STOPPED;
	server.pid = undefined;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// POST /api/servers/stop-all — stop all running servers
serversRouter.post('/stop-all', async (_req, res) => {
	const servers = await store.list<IServer>(PREFIX);
	let stoppedCount = 0;

	for (const server of servers) {
		if (server.status === EServerStatus.RUNNING || server.status === EServerStatus.LOADING) {
			if (server.pid) {
				await killServer(server.id, server.pid);
			}
			usedPorts.delete(server.port);
			server.status = EServerStatus.STOPPED;
			server.pid = undefined;
			await store.put(PREFIX + server.id, server);
			stoppedCount++;
		}
	}

	res.json({ ok: true, data: { stoppedCount }, error: null });
});

// POST /api/servers/:id/restart
serversRouter.post('/:id/restart', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	let backend: IBackend | null = null;
	if (server.backendGroupId) {
		const group = await store.get<IBackendGroup>('backendGroups:' + server.backendGroupId);
		if (!group) {
			res.status(400).json({ ok: false, data: null, error: 'Backend group not found' });
			return;
		}
		backend = await store.get<IBackend>('backends:' + group.activeBackendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Active backend in group not found' });
			return;
		}
	} else if (server.backendId) {
		backend = await store.get<IBackend>('backends:' + server.backendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
			return;
		}
	}

	if (!backend) {
		res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	// Kill existing and wait for termination
	await killServer(server.id, server.pid);
	usedPorts.delete(server.port);

	// Re-spawn
	const model = getCachedModels().find(m => m.primaryFile?.filePath === server.modelPath);
	const mmprojPath = model?.mmprojFile?.filePath && server.useMultiModal ? model.mmprojFile.filePath : null;
	
	// Create launch params and auto-assign port if needed
	const launchParams = { ...server.params };
	if (launchParams.port === 0) {
		server.port = await findAvailablePort();
		launchParams.port = server.port;
	} else {
		// User-assigned port: track it
		usedPorts.add(server.port);
	}
	
	const args = await buildServerArgs(
		server.modelPath,
		mmprojPath,
		launchParams,
		backend.defaultArgs,
	);

	const pid = spawnServer(
		server.id,
		backend.path,
		args,
		async (status, error) => {
			server.status = status;
			if (error) server.error = error;
			if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
			await store.put(PREFIX + server.id, server);
		},
	);

	server.pid = pid || undefined;
	server.status = EServerStatus.LOADING;
	server.error = null;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// PUT /api/servers/:id — update params and optionally restart
serversRouter.put('/:id', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	type TUpdatePayload = Partial<Pick<IServer, 'backendId' | 'backendGroupId' | 'modelPath' | 'serverName' | 'params' | 'serverAlias' | 'autoLaunch' | 'autoSaveCheckpointOnStop' | 'autoLoadCheckpointOnStart' | 'useRecommendedInferenceParams' | 'useMultiModal'>> & { relaunch?: boolean };
	const updatePayload = req.body as TUpdatePayload;
	const shouldRelaunch = updatePayload.relaunch ?? true;

	// Validate new backend if changed
	let backend: IBackend | null = null;
	if (updatePayload.backendGroupId) {
		const group = await store.get<IBackendGroup>('backendGroups:' + updatePayload.backendGroupId);
		if (!group) {
			res.status(400).json({ ok: false, data: null, error: 'Backend group not found' });
			return;
		}
		backend = await store.get<IBackend>('backends:' + group.activeBackendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Active backend in group not found' });
			return;
		}
	} else if (updatePayload.backendId) {
		backend = await store.get<IBackend>('backends:' + updatePayload.backendId);
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
			return;
		}
	} else {
		// Use existing backend
		if (server.backendGroupId) {
			const group = await store.get<IBackendGroup>('backendGroups:' + server.backendGroupId);
			if (group) {
				backend = await store.get<IBackend>('backends:' + group.activeBackendId);
			}
		}
		if (!backend && server.backendId) {
			backend = await store.get<IBackend>('backends:' + server.backendId);
		}
		if (!backend) {
			res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
			return;
		}
	}

	// Kill existing if running and relaunching
	if (server.pid && shouldRelaunch) {
		await killServer(server.id, server.pid);
		usedPorts.delete(server.port);
	}

	// Update fields
	if (updatePayload.backendId !== undefined) server.backendId = updatePayload.backendId;
	if (updatePayload.backendGroupId !== undefined) server.backendGroupId = updatePayload.backendGroupId;
	if (updatePayload.modelPath) server.modelPath = updatePayload.modelPath;
	if (updatePayload.serverName != null) server.serverName = updatePayload.serverName;
	if (updatePayload.params) {
		server.params = updatePayload.params;
		// Only update server.port if user explicitly set a non-zero port
		if (updatePayload.params.port > 0) {
			server.port = updatePayload.params.port;
		}
		// If port is 0, server.port stays as-is until relaunch
	}
	if (updatePayload.serverAlias !== undefined) {
		// Check for removed aliases and clear sticky routes for this server
		const oldAliases = new Set(server.serverAlias);
		const newAliases = new Set(updatePayload.serverAlias);
		for (const alias of oldAliases) {
			if (!newAliases.has(alias)) {
				// Alias was removed - check if there's a sticky route for it pointing to this server
				const routes = await getStickyRoutesResolved();
				const route = routes.find(r => r.alias === alias && r.serverId === server.id);
				if (route) {
					clearStickyRoute(alias);
				}
			}
		}
		server.serverAlias = updatePayload.serverAlias;
	}
	if (updatePayload.autoLaunch !== undefined) {
		server.autoLaunch = updatePayload.autoLaunch;
	}
	if (updatePayload.autoSaveCheckpointOnStop !== undefined) {
		server.autoSaveCheckpointOnStop = updatePayload.autoSaveCheckpointOnStop;
	}
	if (updatePayload.autoLoadCheckpointOnStart !== undefined) {
		server.autoLoadCheckpointOnStart = updatePayload.autoLoadCheckpointOnStart;
	}
	if (updatePayload.useRecommendedInferenceParams !== undefined) {
		server.useRecommendedInferenceParams = updatePayload.useRecommendedInferenceParams;
	}
	if (updatePayload.useMultiModal !== undefined) {
		server.useMultiModal = updatePayload.useMultiModal;
	}

	if (shouldRelaunch) {
		// Re-spawn with new params
		const model = getCachedModels().find(m => m.primaryFile?.filePath === server.modelPath);
		const mmprojPath = model?.mmprojFile?.filePath && server.useMultiModal ? model.mmprojFile.filePath : null;
		
		// Append recommended inference params to extraArgs if enabled
		const launchParams = { ...server.params };
		if (server.useRecommendedInferenceParams && model?.recommendedInferenceParams) {
			launchParams.extraArgs = mergeCliFlags(model.recommendedInferenceParams, server.params.extraArgs);
		}
		
		// Auto-assign port if params.port is 0
		if (launchParams.port === 0) {
			server.port = await findAvailablePort();
			launchParams.port = server.port;
		} else {
			// User-assigned port: track it
			usedPorts.add(server.port);
		}
		
		const args = await buildServerArgs(
			server.modelPath,
			mmprojPath,
			launchParams,
			backend.defaultArgs,
		);

		const pid = spawnServer(
			server.id,
			backend.path,
			args,
			async (status, error) => {
				server.status = status;
				if (error) server.error = error;
				if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
				await store.put(PREFIX + server.id, server);
			},
		);

		server.pid = pid || undefined;
		server.status = EServerStatus.LOADING;
		server.error = null;
	} else {
		// Just update config without relaunching — preserve current status and PID
	}

	await store.put(PREFIX + server.id, server);

	// Emit SSE update so frontend receives the config change
	sseManager.emit('servers:update', { [server.id]: server });

	res.json({ ok: true, data: server, error: null });
});

// DELETE /api/servers/:id — stop and remove
serversRouter.delete('/:id', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	await killServer(server.id, server.pid);
	usedPorts.delete(server.port);
	clearServerLogs(server.id);
	await store.del(PREFIX + server.id);

	sseManager.emit('servers:delete', { [server.id]: null });

	res.json({ ok: true, data: null, error: null });
});

// GET /api/servers/:id/logs
serversRouter.get('/:id/logs', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	const logs = getServerLogs(server.id);
	res.json({ ok: true, data: logs, total: logs.length, error: null });
});

// DELETE /api/servers/:id/logs — clear logs
serversRouter.delete('/:id/logs', async (req, res) => {
	clearServerLogs(req.params.id!);
	res.json({ ok: true, data: null, error: null });
});
