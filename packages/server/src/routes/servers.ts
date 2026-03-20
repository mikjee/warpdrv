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
import type {
	IServer,
	IServerCreatePayload,
	IBackend,
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
				server.pid = null;
				await store.put(PREFIX + server.id, server);
			}
		}
	}
}

// GET /api/servers
serversRouter.get('/', async (_req, res) => {
	const servers = await store.list<IServer>(PREFIX);
	res.json({ ok: true, data: servers, total: servers.length, error: null });
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

	// Validate backend exists
	const backend = await store.get<IBackend>('backends:' + payload.backendId);
	if (!backend) {
		res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	// Assign port
	const port = payload.params.port > 0
		? payload.params.port
		: await findAvailablePort();

	const params = { ...payload.params, port };
	const id = crypto.randomBytes(6).toString('hex');

	const server: IServer = {
		id,
		backendId: payload.backendId,
		modelPath: payload.modelPath,
		mmprojPath: payload.mmprojPath,
		modelAlias: payload.modelAlias,
		params,
		port,
		pid: null,
		status: EServerStatus.STOPPED,
		startedAt: null,
		error: null,
		stats: null,
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
	);

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

	killServer(server.id);
	usedPorts.delete(server.port);

	server.status = EServerStatus.STOPPED;
	server.pid = null;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// POST /api/servers/:id/restart
serversRouter.post('/:id/restart', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	const backend = await store.get<IBackend>('backends:' + server.backendId);
	if (!backend) {
		res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	// Kill existing
	killServer(server.id);

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

	server.pid = pid;
	server.status = EServerStatus.LOADING;
	server.error = null;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// PUT /api/servers/:id — update params and restart
serversRouter.put('/:id', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	const updatePayload = req.body as Partial<Pick<IServer, 'backendId' | 'modelPath' | 'mmprojPath' | 'params'>>;

	// Validate new backend if changed
	let backend = await store.get<IBackend>('backends:' + (updatePayload.backendId ?? server.backendId));
	if (!backend) {
		res.status(400).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	// Kill existing if running
	if (server.pid) {
		killServer(server.id);
		usedPorts.delete(server.port);
	}

	// Update fields
	if (updatePayload.backendId) server.backendId = updatePayload.backendId;
	if (updatePayload.modelPath) server.modelPath = updatePayload.modelPath;
	if (updatePayload.mmprojPath !== undefined) server.mmprojPath = updatePayload.mmprojPath;
	if (updatePayload.params) server.params = updatePayload.params;

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

	server.pid = pid;
	server.status = EServerStatus.LOADING;
	server.error = null;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// DELETE /api/servers/:id — stop and remove
serversRouter.delete('/:id', async (req, res) => {
	const server = await store.get<IServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}

	killServer(server.id);
	usedPorts.delete(server.port);
	clearServerLogs(server.id);
	await store.del(PREFIX + server.id);

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
