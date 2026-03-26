import { Router } from 'express';
import { store } from '../util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';

export const settingsRouter = Router();

// GET /api/settings - returns persisted preferences only
settingsRouter.get('/', async (_req, res) => {
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	res.json({ ok: true, data: settings ?? DEFAULT_SETTINGS, error: null });
});

// PUT /api/settings - persists preferences only, no side effects
settingsRouter.put('/', async (req, res) => {
	const current = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const updated: ISettings = { ...current, ...req.body };
	await store.put(SETTINGS_KEY, updated);

	res.json({ ok: true, data: updated, error: null });
});
