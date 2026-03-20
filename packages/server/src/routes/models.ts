import { Router } from 'express';
import { store } from '../util/store';
import { scanAllModelRoots } from '../services/modelScanner';
import type { ISettings, IModel } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';

// Cached scan results (refreshed on demand)
let cachedModels: IModel[] = [];
let lastScanAt = 0;

export const modelsRouter = Router();

// GET /api/models — list all scanned models
modelsRouter.get('/', async (_req, res) => {
	res.json({ ok: true, data: cachedModels, total: cachedModels.length, error: null });
});

// POST /api/models/scan — trigger a fresh scan of all model roots
modelsRouter.post('/scan', async (_req, res) => {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

	if (settings.modelRoots.length === 0) {
		res.json({ ok: true, data: [], total: 0, error: 'No model directories configured' });
		return;
	}

	cachedModels = await scanAllModelRoots(settings.modelRoots);
	lastScanAt = Date.now();

	res.json({ ok: true, data: cachedModels, total: cachedModels.length, error: null });
});

// GET /api/models/scan-status
modelsRouter.get('/scan-status', (_req, res) => {
	res.json({
		ok: true,
		data: {
			modelCount: cachedModels.length,
			lastScanAt,
		},
		error: null,
	});
});

// Expose for other routes to use
export function getCachedModels(): IModel[] {
	return cachedModels;
}
