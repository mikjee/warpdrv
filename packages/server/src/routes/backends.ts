import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import os from 'os';
import { store } from '../util/store';
import { validateBackend } from '../services/backendValidator';
import { startGenericDownload } from '../services/downloadManager';
import { fetchLlamaReleases } from '../services/releases';
import type { IBackend, IBackendCreatePayload, IBackendUpdatePayload, IDownloadPostAction } from '@warpcore/shared';
import { EValidationStatus, EPostActionType, EPostActionStatus } from '@warpcore/shared';
import { sseManager } from '../services/sseManagerInstance';

const PREFIX = 'backends:';

export async function emitDevicesUpdate(): Promise<void> {
	try {
		const backends = await store.list<IBackend>(PREFIX);
		const devices = backends.flatMap(b => b.detectedDevices ?? []);
		sseManager.emit('devices:init', devices);
	} catch {
		// Ignore errors - SSE is optional
	}
}

export const backendsRouter = Router();

// GET /api/backends
backendsRouter.get('/', async (_req, res) => {
	const backends = await store.list<IBackend>(PREFIX);
	res.json({ ok: true, data: backends, total: backends.length, error: null });
});

// GET /api/backends/:id
backendsRouter.get('/:id', async (req, res) => {
	const backend = await store.get<IBackend>(PREFIX + req.params.id);
	if (!backend) {
		res.status(404).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}
	res.json({ ok: true, data: backend, error: null });
});

// POST /api/backends
backendsRouter.post('/', async (req, res) => {
	const payload = req.body as IBackendCreatePayload;

	if (!payload.name?.trim() || !payload.path?.trim()) {
		res.status(400).json({ ok: false, data: null, error: 'Name and path are required' });
		return;
	}

	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();

	// Validate binary
	const validation = await validateBackend(payload.path, id);

	const backend: IBackend = {
		id,
		name: payload.name.trim(),
		path: payload.path.trim(),
		defaultArgs: payload.defaultArgs ?? [],
		description: payload.description ?? '',
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		detectedDevices: validation.devices,
		createdAt: now,
		updatedAt: now,
	};

	await store.put(PREFIX + id, backend);
	sseManager.emit('backends:update', backend);
	await emitDevicesUpdate();
	res.status(201).json({ ok: true, data: backend, error: null });
});

// PUT /api/backends/:id
backendsRouter.put('/:id', async (req, res) => {
	const existing = await store.get<IBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	const payload = req.body as IBackendUpdatePayload;
	const updated: IBackend = {
		...existing,
		...payload,
		updatedAt: Date.now(),
	};

	// Re-validate if path changed
	if (payload.path && payload.path !== existing.path) {
		const validation = await validateBackend(payload.path, existing.id);
		updated.validation = validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID;
		updated.version = validation.version;
		updated.detectedDevices = validation.devices;
	}

	await store.put(PREFIX + existing.id, updated);
	sseManager.emit('backends:update', updated);
	await emitDevicesUpdate();
	res.json({ ok: true, data: updated, error: null });
});

// DELETE /api/backends/:id
backendsRouter.delete('/:id', async (req, res) => {
	const existing = await store.get<IBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}
await store.del(PREFIX + req.params.id);
	sseManager.emit('backends:delete', existing);
	await emitDevicesUpdate();
	res.json({ ok: true, data: null, error: null });
});

// POST /api/backends/:id/validate — re-run validation and device discovery
backendsRouter.post('/:id/validate', async (req, res) => {
	const existing = await store.get<IBackend>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend not found' });
		return;
	}

	const validation = await validateBackend(existing.path, existing.id);
	existing.validation = validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID;
	existing.version = validation.version;
	existing.detectedDevices = validation.devices;
	existing.updatedAt = Date.now();

await store.put(PREFIX + existing.id, existing);
	sseManager.emit('backends:update', existing);
	await emitDevicesUpdate();
	res.json({ ok: true, data: existing, validation: validation.error });
});
// POST /api/backends/install — download + install prebuilt backend by asset key
backendsRouter.post('/install', async (req, res) => {
	const { assetKey, installRoot } = req.body as { assetKey: string; installRoot?: string };
	if (!assetKey) {
		res.status(400).json({ ok: false, data: null, error: 'assetKey is required' });
		return;
	}
	const assets = await fetchLlamaReleases();
	const asset = assets.find(a => a.key === assetKey);
	if (!asset) {
		res.status(404).json({ ok: false, data: null, error: `Asset not found: ${assetKey}` });
		return;
	}
	const root = installRoot ?? path.join(os.homedir(), '.config', 'warpcore', 'backends');
	const installDir = path.join(root, asset.key);
	const binaryName = asset.os === 'win' ? 'llama-server.exe' : 'llama-server';
	const labelParts = [
		'llama.cpp',
		asset.backend.toUpperCase(),
		asset.backendVersion ?? '',
		asset.gpuArch ?? '',
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
			type: EPostActionType.REGISTER_LLAMA_BACKEND,
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
