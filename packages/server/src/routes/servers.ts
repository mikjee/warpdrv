import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import {
	buildArgs,
	spawnServer,
	killServer,
	isProcessAlive,
	getServerLogs,
	clearServerLogs,
} from '../services/processManager';
import { getServerStats } from '../services/statsPoller';
import { clearStickyRoute, getStickyRoutesResolved } from '../services/modelProxy';
import { sseManager } from '../services/sseManagerInstance';
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

			const args = buildArgs(
				server.modelPath,
				server.mmprojPath,
				server.params,
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

	// Assign port
	const port = payload.params.port > 0
		? payload.params.port
		: await findAvailablePort();

	const params = { ...payload.params, port };
	const id = crypto.randomBytes(6).toString('hex');

	// Generate server name from model filename if not provided
	const serverName = payload.serverName ?? payload.modelPath.split('/').pop()?.replace('.gguf', '') ?? 'server';

	const server: IServer = {
		id,
		backendId: payload.backendId,
		backendGroupId: payload.backendGroupId,
		modelPath: payload.modelPath,
		mmprojPath: payload.mmprojPath,
		serverName,
		serverAlias: payload.serverAlias ?? [],
		params,
		port,
		pid: undefined,
		status: EServerStatus.STOPPED,
		startedAt: null,
		error: null,
		stats: null,
		autoLaunch: payload.autoLaunch ?? false,
		autoSaveCheckpointOnStop: payload.autoSaveCheckpointOnStop ?? false,
		autoLoadCheckpointOnStart: payload.autoLoadCheckpointOnStart ?? false,
	};

	// Build args and spawn
	const args = buildArgs(
		payload.modelPath,
		payload.mmprojPath,
		params,
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

	// Kill existing and wait for termination
	await killServer(server.id, server.pid);

	// Re-spawn
	const args = buildArgs(
		server.modelPath,
		server.mmprojPath,
		server.params,
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

	type TUpdatePayload = Partial<Pick<IServer, 'backendId' | 'backendGroupId' | 'modelPath' | 'mmprojPath' | 'serverName' | 'params' | 'serverAlias' | 'autoLaunch' | 'autoSaveCheckpointOnStop' | 'autoLoadCheckpointOnStart'>> & { relaunch?: boolean };
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
	if (updatePayload.mmprojPath !== undefined) server.mmprojPath = updatePayload.mmprojPath;
	if (updatePayload.serverName != null) server.serverName = updatePayload.serverName;
	if (updatePayload.params) {
		server.params = updatePayload.params;
		// Sync server.port with params.port if a specific port was configured
		if (updatePayload.params.port > 0) {
			server.port = updatePayload.params.port;
		}
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

	if (shouldRelaunch) {
		// Re-spawn with new params
		const args = buildArgs(
			server.modelPath,
			server.mmprojPath,
			server.params,
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
