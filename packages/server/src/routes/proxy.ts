import { Router } from 'express';
import http from 'http';
import {
	getStickyRoutesResolved,
	clearStickyRoute,
	clearAllStickyRoutes,
	startModelProxy,
	stopModelProxy,
	getModelProxyInstance,
	getProxyError,
} from '../services/modelProxy';
import { store } from '../util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';

export const proxyRouter = Router();
const SETTINGS_KEY = 'settings:general';

// Health check helper - probes the proxy's /health endpoint
function checkProxyHealth(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
			resolve(res.statusCode === 200);
		});
		req.on('error', () => resolve(false));
		req.setTimeout(1000, () => {
			req.destroy();
			resolve(false);
		});
	});
}

// GET /api/proxy/status - returns proxy status and config with actual health check
proxyRouter.get('/status', async (_req, res) => {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

	// Check if proxy server instance is actually running
	const running = !!getModelProxyInstance();

	let healthy = false;
	if (running && settings.proxyEnabled) {
		healthy = await checkProxyHealth(settings.proxyPort);
	}

	res.json({
		ok: true,
		data: {
			enabled: settings.proxyEnabled,
			port: settings.proxyPort,
			running, // whether proxy server instance exists
			healthy, // actual health status from /health endpoint probe
			error: getProxyError(), // error message if proxy failed to start
		},
		error: null,
	});
});

// GET /api/proxy/routes - returns current sticky routes with resolved server names
proxyRouter.get('/routes', async (_req, res) => {
	const routes = await getStickyRoutesResolved();
	res.json({ ok: true, data: routes, error: null });
});

// DELETE /api/proxy/routes/:alias - clear a specific sticky route
proxyRouter.delete('/routes/:alias', (req, res) => {
	const cleared = clearStickyRoute(req.params.alias);
	res.json({ ok: true, data: { cleared }, error: null });
});

// DELETE /api/proxy/routes - clear all sticky routes
proxyRouter.delete('/routes', (_req, res) => {
	clearAllStickyRoutes();
	res.json({ ok: true, data: null, error: null });
});

// POST /api/proxy/start - start the proxy server (fire and forget)
proxyRouter.post('/start', async (_req, res) => {
	// Check if already running or starting
	if (getModelProxyInstance()) {
		res.json({ ok: true, data: null, error: null });
		return;
	}

	startModelProxy(); // fire and forget - don't wait for result
	res.json({ ok: true, data: null, error: null });
});

// POST /api/proxy/stop - stop the proxy server (fire and forget)
proxyRouter.post('/stop', async (_req, res) => {
	if (!getModelProxyInstance()) {
		res.json({ ok: true, data: null, error: null });
		return;
	}

	await stopModelProxy();
	res.json({ ok: true, data: null, error: null });
});
