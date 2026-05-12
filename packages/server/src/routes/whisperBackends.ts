import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import { validateWhisperBackend } from '../services/whisperBackendValidator';
import type { IWhisperBackend, IWhisperBackendCreatePayload, IWhisperBackendUpdatePayload } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';
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
