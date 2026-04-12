import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../util/store';
import { sseManager } from '../services/sseManagerInstance';
import type { IBackendGroup, IBackendGroupCreatePayload, IBackendGroupUpdatePayload } from '@warpcore/shared';

const PREFIX = 'backendGroups:';

export const backendGroupsRouter = Router();

// GET /api/backend-groups
backendGroupsRouter.get('/', async (_req, res) => {
	const groups = await store.list<IBackendGroup>(PREFIX);
	res.json({ ok: true, data: groups, total: groups.length, error: null });
});

// GET /api/backend-groups/:id
backendGroupsRouter.get('/:id', async (req, res) => {
	const group = await store.get<IBackendGroup>(PREFIX + req.params.id);
	if (!group) {
		res.status(404).json({ ok: false, data: null, error: 'Backend group not found' });
		return;
	}
	res.json({ ok: true, data: group, error: null });
});

// POST /api/backend-groups
backendGroupsRouter.post('/', async (req, res) => {
	const payload = req.body as IBackendGroupCreatePayload;

	if (!payload.name?.trim()) {
		res.status(400).json({ ok: false, data: null, error: 'Name is required' });
		return;
	}

	if (!payload.backendIds || payload.backendIds.length === 0) {
		res.status(400).json({ ok: false, data: null, error: 'At least one backend is required' });
		return;
	}

	if (!payload.backendIds.includes(payload.activeBackendId)) {
		res.status(400).json({ ok: false, data: null, error: 'Active backend must be in the group' });
		return;
	}

	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();

	const group: IBackendGroup = {
		id,
		name: payload.name.trim(),
		description: payload.description ?? '',
		backendIds: payload.backendIds,
		activeBackendId: payload.activeBackendId,
		createdAt: now,
		updatedAt: now,
	};

	await store.put(PREFIX + id, group);
	sseManager.emit('backend-groups:update', group);
	res.status(201).json({ ok: true, data: group, error: null });
});

// PUT /api/backend-groups/:id
backendGroupsRouter.put('/:id', async (req, res) => {
	const existing = await store.get<IBackendGroup>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend group not found' });
		return;
	}

	const payload = req.body as IBackendGroupUpdatePayload;
	const updated: IBackendGroup = {
		...existing,
		...payload,
		updatedAt: Date.now(),
	};

	if (payload.backendIds && payload.activeBackendId && !payload.backendIds.includes(payload.activeBackendId)) {
		res.status(400).json({ ok: false, data: null, error: 'Active backend must be in the group' });
		return;
	}

	await store.put(PREFIX + existing.id, updated);
	sseManager.emit('backend-groups:update', updated);
	res.json({ ok: true, data: updated, error: null });
});

// DELETE /api/backend-groups/:id
backendGroupsRouter.delete('/:id', async (req, res) => {
	const existing = await store.get<IBackendGroup>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend group not found' });
		return;
	}

	await store.del(PREFIX + req.params.id);
	sseManager.emit('backend-groups:delete', existing);
	res.json({ ok: true, data: null, error: null });
});

// POST /api/backend-groups/:id/activate/:backendId
backendGroupsRouter.post('/:id/activate/:backendId', async (req, res) => {
	const existing = await store.get<IBackendGroup>(PREFIX + req.params.id);
	if (!existing) {
		res.status(404).json({ ok: false, data: null, error: 'Backend group not found' });
		return;
	}

	if (!existing.backendIds.includes(req.params.backendId)) {
		res.status(400).json({ ok: false, data: null, error: 'Backend not in group' });
		return;
	}

	existing.activeBackendId = req.params.backendId;
	existing.updatedAt = Date.now();

	await store.put(PREFIX + existing.id, existing);
	sseManager.emit('backend-groups:update', existing);
	res.json({ ok: true, data: existing, error: null });
});
