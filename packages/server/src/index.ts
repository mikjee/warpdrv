import express from 'express';
import cors from 'cors';
import { store } from './util/store';
import { settingsRouter } from './routes/settings';
import { backendsRouter } from './routes/backends';
import { modelsRouter } from './routes/models';
import { serversRouter, reconcileServers } from './routes/servers';
import { presetsRouter } from './routes/presets';
import { hubRouter } from './routes/hub';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';

async function main() {
	// Ensure default settings exist
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	if (!settings) {
		await store.put(SETTINGS_KEY, DEFAULT_SETTINGS);
	}

	// Reconcile any servers that were running before restart
	await reconcileServers();

	const app = express();

	app.use(cors());
	app.use(express.json());

	// API routes
	app.use('/api/settings', settingsRouter);
	app.use('/api/backends', backendsRouter);
	app.use('/api/models', modelsRouter);
	app.use('/api/servers', serversRouter);
	app.use('/api/presets', presetsRouter);
	app.use('/api/hub', hubRouter);

	// Health check
	app.get('/api/health', (_req, res) => {
		res.json({ ok: true, version: '0.1.0' });
	});

	const currentSettings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const port = currentSettings.apiPort;
	const host = currentSettings.apiHost;

	app.listen(port, host, () => {
		console.log(`[WarpCore] API server listening on ${host}:${port}`);
	});
}

main().catch(err => {
	console.error('[WarpCore] Fatal error:', err);
	process.exit(1);
});
