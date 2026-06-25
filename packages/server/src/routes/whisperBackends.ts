import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { store } from '../util/store';
import { validateWhisperBackend } from '../services/whisperBackendValidator';
import { startGenericDownload } from '../services/downloadManager';
import { fetchWhisperReleases } from '../services/releases';
import type { IWhisperBackend, IWhisperBackendCreatePayload, IWhisperBackendUpdatePayload, IDownloadPostAction } from '@warpcore/shared';
import { EValidationStatus, EPostActionType, EPostActionStatus } from '@warpcore/shared';
import { sseManager } from '../services/sseManagerInstance';

const PREFIX = 'whisperBackends:';

export const whisperBackendsRouter = Router();

// GET /api/whisper-backends
whisperBackendsRouter.get('/', async (_req, res) => {
	const backends = await store.list<IWhisperBackend>(PREFIX);
	res.json({ ok: true, data: backends, total: backends.length, error: null });
});

// GET /api/whisper-backends/:id
whisperBackendsRouter.get('/:id', async (req, res) => {
	const backend = await store.get<IWhisperBackend>(PREFIX + req.params.id);
	if (!backend) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper backend not found' });
		return;
	}
	res.json({ ok: true, data: backend, error: null });
});

// POST /api/whisper-backends
whisperBackendsRouter.post('/', async (req, res) => {
	const payload = req.body as IWhisperBackendCreatePayload;

	if (!payload.name?.trim() || !payload.path?.trim()) {
		res.status(400).json({ ok: false, data: null, error: 'Name and path are required' });
		return;
	}

	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();

	const validation = await validateWhisperBackend(payload.path);

	const backend: IWhisperBackend = {
		id,
		name: payload.name.trim(),
		path: payload.path.trim(),
		defaultArgs: payload.defaultArgs ?? [],
		description: payload.description ?? '',
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		createdAt: now,
		updatedAt: now,
	};

	await store.put(PREFIX + id, backend);
	sseManager.emit('whisperBackends:update', backend);
	res.status(201).json({ ok: true, data: backend, error: null });
});

// PUT /api/whisper-backends/:id
whisperBackendsRouter.put('/:id', async (req, res) => {
	const existing = await store.get<IWhisperBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper backend not found' });
		return;
	}

	const payload = req.body as IWhisperBackendUpdatePayload;
	const updated: IWhisperBackend = {
		...existing,
		...payload,
		updatedAt: Date.now(),
	};

	if (payload.path && payload.path !== existing.path) {
		const validation = await validateWhisperBackend(payload.path);
		updated.validation = validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID;
		updated.version = validation.version;
	}

	await store.put(PREFIX + existing.id, updated);
	sseManager.emit('whisperBackends:update', updated);
	res.json({ ok: true, data: updated, error: null });
});

// DELETE /api/whisper-backends/:id
whisperBackendsRouter.delete('/:id', async (req, res) => {
	const existing = await store.get<IWhisperBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper backend not found' });
		return;
	}
	await store.del(PREFIX + req.params.id);
	sseManager.emit('whisperBackends:delete', existing);
	res.json({ ok: true, data: null, error: null });
});

// POST /api/whisper-backends/:id/validate
whisperBackendsRouter.post('/:id/validate', async (req, res) => {
	const existing = await store.get<IWhisperBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Whisper backend not found' });
		return;
	}

const validation = await validateWhisperBackend(existing.path);
	existing.validation = validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID;
	existing.version = validation.version;
	existing.updatedAt = Date.now();
	await store.put(PREFIX + existing.id, existing);
	sseManager.emit('whisperBackends:update', existing);
	res.json({ ok: true, data: existing, error: null });
});
// POST /api/whisper-backends/install
whisperBackendsRouter.post('/install', async (req, res) => {
	const { assetKey, installRoot } = req.body as { assetKey: string; installRoot?: string };
	if (!assetKey) {
		res.status(400).json({ ok: false, data: null, error: 'assetKey is required' });
		return;
	}
	const assets = await fetchWhisperReleases();
	const asset = assets.find(a => a.key === assetKey);
	if (!asset) {
		res.status(404).json({ ok: false, data: null, error: `Asset not found: ${assetKey}` });
		return;
	}
	const root = installRoot ?? path.join(os.homedir(), '.config', 'warpcore', 'whisper-backends');
	const installDir = path.join(root, asset.key);
	const binaryName = asset.os === 'win' ? 'whisper-server.exe' : 'whisper-server';
	const labelParts = [
		'whisper.cpp',
		asset.backend.toUpperCase(),
		asset.backendVersion ?? '',
		`(${asset.llamaBuild})`,
	].filter(p => p.length > 0);
	const name = labelParts.join(' ');
	const description = `Auto-installed from ${asset.source} ${asset.llamaBuild}`;
	const postActions: IDownloadPostAction[] = [
		{
			type: EPostActionType.EXTRACT_ARCHIVE,
			payload: { destDir: installDir },
			status: EPostActionStatus.PENDING,
			error: null,
		},
		{
			type: EPostActionType.LOCATE_BINARY,
			payload: { rootDir: installDir, binaryName, contextKey: 'binaryPath' },
			status: EPostActionStatus.PENDING,
			error: null,
		},
		{
			type: EPostActionType.CHMOD_EXECUTABLE,
			payload: { binaryPath: '__LOCATED__' },
			status: EPostActionStatus.PENDING,
			error: null,
		},
		{
			type: EPostActionType.REGISTER_WHISPER_BACKEND,
			payload: { binaryPath: '__LOCATED__', name, description, defaultArgs: [] },
			status: EPostActionStatus.PENDING,
			error: null,
		},
	];
	try {
		const dl = await startGenericDownload(asset.url, installDir, asset.filename, postActions);
		res.json({ ok: true, data: dl, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});
