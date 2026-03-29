import express from 'express';
import cors from 'cors';
import { store } from './util/store';
import { settingsRouter } from './routes/settings';
import { backendsRouter } from './routes/backends';
import { modelsRouter, loadCachedModels } from './routes/models';
import { serversRouter, reconcileServers, launchAutoStartServers } from './routes/servers';
import { presetsRouter } from './routes/presets';
import { hubRouter } from './routes/hub';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { runMigrations } from './services/migrationRunner';
import { updateRouter } from './routes/update';
import { chatRouter } from './routes/chat';
import { initChatDb } from './util/chatDB';
import { proxyRouter } from './routes/proxy';
import { startModelProxy } from './services/modelProxy';
import { summaryRouter } from './routes/summary';
import { SSEManager } from './services/sseManager';

const SETTINGS_KEY = 'settings:general';
const sseManager = new SSEManager();

async function main() {
	await runMigrations();

	// Ensure default settings exist
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	if (!settings) await store.put(SETTINGS_KEY, DEFAULT_SETTINGS);

	// Reconcile any servers that were running before restart
	await reconcileServers();
	await initChatDb();

	// Load cached model scan results
	await loadCachedModels();

	// Launch auto-start servers after all data has loaded
	await launchAutoStartServers();

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
	app.use('/api/proxy', proxyRouter);
	app.use('/api/chat', chatRouter);
	app.use('/api/summary', summaryRouter);

	// SSE endpoint
	app.get('/api/events', (req, res) => {
		sseManager.handleConnection(req, res, () => {
			console.log('[SSE] Client disconnected');
		});
	});

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

	// Port: env var overrides settings, defaults to 4400
	const envPort = process.env.CONTROL_API_PORT;
	const port = envPort ? parseInt(envPort, 10) : (currentSettings.apiPort ?? DEFAULT_SETTINGS.apiPort);
	if (isNaN(port) || port < 1 || port > 65535) {
		console.error(`[WarpCore] Invalid CONTROL_API_PORT: ${envPort}. Using default 4400.`);
	}

	const host = currentSettings.apiHost ?? DEFAULT_SETTINGS.apiHost;

	// Register SSE channels
	function registerSSEChannels(): void {
		// Phase 0.5 test - emit every second
		sseManager.onInterval('test', () => ({
			timestamp: Date.now(),
			count: Date.now() % 1000,
		}), 1000);

		// Phase 1: Add servers, downloads, devices, proxy channels here
	}

	registerSSEChannels();

	app.listen(port, host, () => {
		console.log(`[WarpCore] API server listening on ${host}:${port}`);
		if (envPort) {
			console.log(`[WarpCore] Port set via CONTROL_API_PORT environment variable`);
		}
	});

	// Start model proxy if enabled in settings
	if (currentSettings.proxyEnabled) {
		await startModelProxy();
	}
}

main().catch(err => {
	console.error('[WarpCore] Fatal error:', err);
	process.exit(1);
});
