import { Router } from 'express';
import { scanAllWhisperModelRoots, getCachedWhisperModels } from '../services/whisperModelScanner';
import { store } from '../util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

export const whisperModelsRouter = Router();
const SETTINGS_KEY = 'settings:general';

// GET /api/whisper-models
whisperModelsRouter.get('/', async (_req, res) => {
	try {
		const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
		const models = await scanAllWhisperModelRoots(settings.modelRoots);
		res.json({ ok: true, data: models, total: models.length, error: null });
	} catch (err) {
		res.json({ ok: false, data: [], error: String(err) });
	}
});

// GET /api/whisper-models/cache
whisperModelsRouter.get('/cache', async (_req, res) => {
	try {
		const models = await getCachedWhisperModels();
		res.json({ ok: true, data: models, total: models.length, error: null });
	} catch (err) {
		res.json({ ok: false, data: [], error: String(err) });
	}
});
