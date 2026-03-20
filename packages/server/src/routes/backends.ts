import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import { validateBackend } from '../services/backendValidator';
import type { IBackend, IBackendCreatePayload, IBackendUpdatePayload } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';

const PREFIX = 'backends:';

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
	res.json({ ok: true, data: existing, error: validation.error });
});
