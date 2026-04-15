import { Router } from 'express';
import {
	saveCheckpoint,
	restoreCheckpoint,
	listCheckpoints,
	deleteCheckpoint,
	updateCheckpoint,
} from '../services/checkpointService';
import { sseManager } from '../services/sseManagerInstance';
import type {
	ISaveCheckpointRequest,
	IRestoreCheckpointRequest,
} from '@warpcore/shared';
import { SSE_CHANNELS_CHECKPOINT } from '@warpcore/shared';

export const checkpointsRouter = Router();

// GET /api/checkpoints?serverId=...
checkpointsRouter.get('/', async (req, res) => {
	try {
		const serverId = typeof req.query.serverId === 'string' ? req.query.serverId : null;
		const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : null;
		const checkpoints = await listCheckpoints({ serverId, threadId });
		res.json({ ok: true, data: checkpoints, total: checkpoints.length, error: null });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		res.status(500).json({ ok: false, data: null, error: message });
	}
});

// POST /api/checkpoints — save
checkpointsRouter.post('/', async (req, res) => {
	try {
		const payload = req.body as ISaveCheckpointRequest;
		const result = await saveCheckpoint(payload);
		for (const cp of result.checkpoints) {
			sseManager.emit(SSE_CHANNELS_CHECKPOINT.CHECKPOINT_CREATED, { checkpoint: cp });
		}
		res.status(201).json({ ok: true, data: result, error: null });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		res.status(500).json({ ok: false, data: null, error: message });
	}
});

// POST /api/checkpoints/restore
checkpointsRouter.post('/restore', async (req, res) => {
	try {
		const payload = req.body as IRestoreCheckpointRequest;
		const result = await restoreCheckpoint(payload);
		if (result.success) {
			sseManager.emit(SSE_CHANNELS_CHECKPOINT.CHECKPOINT_RESTORED, {
				targetServerId: payload.targetServerId,
				restoredSlotCount: result.restoredSlotCount,
				bundleId: payload.bundleId,
			});
		}
		res.json({ ok: result.success, data: result, error: null });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		res.status(500).json({ ok: false, data: null, error: message });
	}
});

// PUT /api/checkpoints/:id
checkpointsRouter.put('/:id', async (req, res) => {
	try {
		const patch = req.body as { name?: string; notes?: string | null };
		const updated = await updateCheckpoint(req.params.id, patch);
		if (updated == null) {
			res.status(404).json({ ok: false, data: null, error: 'Checkpoint not found' });
			return;
		}
		sseManager.emit(SSE_CHANNELS_CHECKPOINT.CHECKPOINT_UPDATED, { checkpoint: updated });
		res.json({ ok: true, data: updated, error: null });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		res.status(500).json({ ok: false, data: null, error: message });
	}
});

// DELETE /api/checkpoints/:id
checkpointsRouter.delete('/:id', async (req, res) => {
	try {
		const removed = await deleteCheckpoint(req.params.id);
		if (!removed) {
			res.status(404).json({ ok: false, data: null, error: 'Checkpoint not found' });
			return;
		}
		sseManager.emit(SSE_CHANNELS_CHECKPOINT.CHECKPOINT_DELETED, { checkpointId: req.params.id });
		res.json({ ok: true, data: { id: req.params.id }, error: null });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		res.status(500).json({ ok: false, data: null, error: message });
	}
});
