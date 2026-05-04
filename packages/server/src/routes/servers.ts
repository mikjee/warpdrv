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
	SERVERS_PREFIX,
	findRandomAvailablePort,
	usedPorts,
	launchServer,
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

const PREFIX = SERVERS_PREFIX;

export const serversRouter = Router();

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

	// Assign port for server.port, but keep params.port as-is (0 = auto-assign on every launch)
	const serverPort = payload.params.port > 0
		? payload.params.port
		: await findRandomAvailablePort();

	// Track user-assigned port
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

	try {
		await launchServer(server);
		res.status(201).json({ ok: true, data: server, error: null });
	} catch (err) {
		res.status(400).json({ ok: false, data: null, error: String(err) });
	}
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

	await killServer(server.id, server.pid);
	usedPorts.delete(server.port);

	try {
		await launchServer(server);
		res.json({ ok: true, data: server, error: null });
	} catch (err) {
		res.status(400).json({ ok: false, data: null, error: String(err) });
	}
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
		try {
			await launchServer(server);
		} catch (err) {
			res.status(400).json({ ok: false, data: null, error: String(err) });
			return;
		}
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
