import { Router } from 'express';
import { store } from '../util/store';
import { scanAllModelRoots } from '../services/modelScanner';
import { sseManager } from '../services/sseManagerInstance';
import type { ISettings, IModel } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';
const MODELS_KEY = 'models:cache';

// Cached scan results (refreshed on demand)
let cachedModels: IModel[] = [];
let lastScanAt = 0;

// Load cached models from store on startup, or scan if cache is empty
export async function loadCachedModels(): Promise<void> {
	try {
		const cached = await store.get<IModel[]>(MODELS_KEY);
		if (cached && cached.length > 0) {
			cachedModels = cached;
			lastScanAt = Date.now();
			console.log(`[models] Loaded ${cachedModels.length} cached models`);
		} else {
			// No cache - perform initial scan
			const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
			if (settings.modelRoots.length > 0) {
				console.log('[models] No cache found, scanning...');
				cachedModels = await scanAllModelRoots(settings.modelRoots);
				lastScanAt = Date.now();
				await store.put(MODELS_KEY, cachedModels);
				console.log(`[models] Initial scan complete: ${cachedModels.length} models`);
			}
		}
	} catch (err) {
		console.warn('[models] Failed to load cached models:', err);
	}
}

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

	const before = cachedModels.length;
	cachedModels = await scanAllModelRoots(settings.modelRoots);
	lastScanAt = Date.now();

	const changed = cachedModels.length - before;
	const changeMsg = changed > 0 ? ` (+${changed})` : changed < 0 ? ` (${changed})` : '';
	console.log(`[models] Scan complete: ${cachedModels.length} models${changeMsg}`);

	sseManager.emit('models:init', cachedModels);

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

// PUT /api/models/:id - update model metadata (e.g., recommendedInferenceParams)
modelsRouter.put('/:id', async (req, res) => {
	const modelId = req.params.id;
	const updateData = req.body as { recommendedInferenceParams?: string };

	const modelIndex = cachedModels.findIndex(m => m.id === modelId);
	if (modelIndex === -1) {
		res.status(404).json({ ok: false, data: null, error: 'Model not found' });
		return;
	}

	const model = cachedModels[modelIndex];
	const updatedModel = { ...model } as IModel;

	if (updateData.recommendedInferenceParams !== undefined) {
		updatedModel.recommendedInferenceParams = updateData.recommendedInferenceParams;
	}

	cachedModels[modelIndex] = updatedModel;

	// Save updated cache
	try {
		await store.put(MODELS_KEY, cachedModels);
		sseManager.emit('models:update', [updatedModel]);
		res.json({ ok: true, data: updatedModel, error: null });
	} catch (err) {
		console.error('[models] Failed to save updated model:', err);
		res.json({ ok: false, data: null, error: String(err) });
	}
});
