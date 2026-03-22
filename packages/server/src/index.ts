import express from 'express';
import cors from 'cors';
import { store } from './util/store';
import { settingsRouter } from './routes/settings';
import { backendsRouter } from './routes/backends';
import { modelsRouter, loadCachedModels } from './routes/models';
import { serversRouter, reconcileServers } from './routes/servers';
import { presetsRouter } from './routes/presets';
import { hubRouter } from './routes/hub';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { runMigrations } from './services/migrationRunner';
import { updateRouter } from './routes/update';

const SETTINGS_KEY = 'settings:general';

async function main() {
	await runMigrations();

	// Ensure default settings exist
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	if (!settings) await store.put(SETTINGS_KEY, DEFAULT_SETTINGS);

	// Reconcile any servers that were running before restart
	await reconcileServers();

	// Load cached model scan results
	await loadCachedModels();

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
	app.use('/api/update', updateRouter);

	// Stats endpoint — returns live stats for a running server
	app.get('/api/servers/:id/stats', (req, res) => {
		const { getServerStats } = require('./services/statsPoller');
		const stats = getServerStats(req.params.id);
		res.json({ ok: true, data: stats, error: null });
	});

	// Static frontend serving (production only)
	const { serveStaticApp } = await import('./middleware/serveStatic');
	serveStaticApp(app);

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
