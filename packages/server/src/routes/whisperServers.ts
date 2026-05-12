import { Router } from 'express';
import crypto from 'crypto';
import http from 'node:http';
import { store } from '../util/store';
import {
	buildWhisperArgs,
	spawnWhisperServer,
	killWhisperServer,
	getWhisperServerLogs,
	clearWhisperServerLogs,
	WHISPER_SERVERS_PREFIX,
	launchWhisperServer,
} from '../services/whisperProcessManager';
import { sseManager } from '../services/sseManagerInstance';

import type {
	IWhisperServer,
	IWhisperServerCreatePayload,
	IWhisperBackend,
} from '@warpcore/shared';
import { EWhisperServerStatus } from '@warpcore/shared';

const PREFIX = WHISPER_SERVERS_PREFIX;

export const whisperServersRouter = Router();

// GET /api/whisper-servers
whisperServersRouter.get('/', async (_req, res) => {
	const servers = await store.list<IWhisperServer>(PREFIX);
	res.json({ ok: true, data: servers, total: servers.length, error: null });
});

// GET /api/whisper-servers/:id
whisperServersRouter.get('/:id', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}
	res.json({ ok: true, data: server, error: null });
});

// POST /api/whisper-servers
whisperServersRouter.post('/', async (req, res) => {
	const payload = req.body as IWhisperServerCreatePayload;

	const id = crypto.randomBytes(6).toString('hex');
	const serverName = payload.serverName ?? payload.modelPath.split('/').pop()?.replace(/\.(gguf|bin)$/, '') ?? 'whisper-server';

	const server: IWhisperServer = {
		id,
		backendId: payload.backendId,
		modelPath: payload.modelPath,
		serverName,
		serverAlias: payload.serverAlias ?? [],
		params: payload.params,
		port: payload.params.port > 0 ? payload.params.port : 0,
		pid: undefined,
		status: EWhisperServerStatus.STOPPED,
		startedAt: null,
		error: null,
		autoLaunch: payload.autoLaunch ?? false,
		launchCommand: null,
	};

	try {
		await launchWhisperServer(server);
		res.status(201).json({ ok: true, data: server, error: null });
	} catch (err) {
		res.status(400).json({ ok: false, data: null, error: String(err) });
	}
});

// POST /api/whisper-servers/:id/stop
whisperServersRouter.post('/:id/stop', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}

	await killWhisperServer(server.id, server.pid);

	server.status = EWhisperServerStatus.STOPPED;
	server.pid = undefined;
	await store.put(PREFIX + server.id, server);

	res.json({ ok: true, data: server, error: null });
});

// POST /api/whisper-servers/stop-all
whisperServersRouter.post('/stop-all', async (_req, res) => {
	const servers = await store.list<IWhisperServer>(PREFIX);
	let stoppedCount = 0;

	for (const server of servers) {
		if (server.status === EWhisperServerStatus.RUNNING || server.status === EWhisperServerStatus.LOADING) {
			if (server.pid) {
				await killWhisperServer(server.id, server.pid);
			}
			server.status = EWhisperServerStatus.STOPPED;
			server.pid = undefined;
			await store.put(PREFIX + server.id, server);
			stoppedCount++;
		}
	}

	res.json({ ok: true, data: { stoppedCount }, error: null });
});

// POST /api/whisper-servers/:id/restart
whisperServersRouter.post('/:id/restart', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}

	await killWhisperServer(server.id, server.pid);

	try {
		await launchWhisperServer(server);
		res.json({ ok: true, data: server, error: null });
	} catch (err) {
		res.status(400).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/whisper-servers/:id
whisperServersRouter.put('/:id', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}

	type TUpdatePayload = Partial<Pick<IWhisperServer, 'backendId' | 'modelPath' | 'serverName' | 'params' | 'serverAlias' | 'autoLaunch'>> & { relaunch?: boolean };
	const updatePayload = req.body as TUpdatePayload;
	const shouldRelaunch = updatePayload.relaunch ?? true;

	if (updatePayload.backendId !== undefined) server.backendId = updatePayload.backendId;
	if (updatePayload.modelPath) server.modelPath = updatePayload.modelPath;
	if (updatePayload.serverName != null) server.serverName = updatePayload.serverName;
	if (updatePayload.params) server.params = updatePayload.params;
	if (updatePayload.serverAlias !== undefined) server.serverAlias = updatePayload.serverAlias;
	if (updatePayload.autoLaunch !== undefined) server.autoLaunch = updatePayload.autoLaunch;

	if (shouldRelaunch && (server.status === EWhisperServerStatus.RUNNING || server.status === EWhisperServerStatus.LOADING)) {
		await killWhisperServer(server.id, server.pid);
	}

	if (shouldRelaunch) {
		try {
			await launchWhisperServer(server);
		} catch (err) {
			res.status(400).json({ ok: false, data: null, error: String(err) });
			return;
		}
	}

	await store.put(PREFIX + server.id, server);
	sseManager.emit('whisperServers:update', { [server.id]: server });
	res.json({ ok: true, data: server, error: null });
});

// DELETE /api/whisper-servers/:id
whisperServersRouter.delete('/:id', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}

	await killWhisperServer(server.id, server.pid);
	clearWhisperServerLogs(server.id);
	await store.del(PREFIX + req.params.id);

	sseManager.emit('whisperServers:delete', { [req.params.id]: null });
	res.json({ ok: true, data: null, error: null });
});

// GET /api/whisper-servers/:id/logs
whisperServersRouter.get('/:id/logs', async (req, res) => {
	const logs = getWhisperServerLogs(req.params.id);
	res.json({ ok: true, data: logs, total: logs.length, error: null });
});

// DELETE /api/whisper-servers/:id/logs
whisperServersRouter.delete('/:id/logs', async (req, res) => {
	clearWhisperServerLogs(req.params.id);
	res.json({ ok: true, data: null, error: null });
});

// POST /api/whisper-servers/:id/transcribe — stream multipart to whisper server
whisperServersRouter.post('/:id/transcribe', async (req, res) => {
	const server = await store.get<IWhisperServer>(PREFIX + req.params.id);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper server not found' });
		return;
	}
	if (server.status !== EWhisperServerStatus.RUNNING) {
		res.status(503).json({ ok: false, data: null, error: 'Whisper server not running' });
		return;
	}

	const upstream = http.request({
		hostname: '127.0.0.1',
		port: server.port,
		path: server.params.inferencePath,
		method: 'POST',
		headers: {
			'content-type': req.headers['content-type'] ?? 'application/octet-stream',
			'content-length': req.headers['content-length'] ?? '',
		},
	}, (upstreamRes) => {
		res.status(upstreamRes.statusCode ?? 502);
		for (const [k, v] of Object.entries(upstreamRes.headers)) {
			if (v !== undefined) res.setHeader(k, v as string | string[]);
		}
		upstreamRes.pipe(res);
	});

	upstream.on('error', (err) => {
		if (!res.headersSent) {
			res.status(502).json({ ok: false, data: null, error: 'Whisper upstream error', message: err.message });
		}
	});

	req.pipe(upstream);
});
