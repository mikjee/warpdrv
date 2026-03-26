import http from 'http';
import express from 'express';
import { store } from '../util/store';
import type { IServer, ISettings } from '@warpcore/shared';
import { EServerStatus, DEFAULT_SETTINGS } from '@warpcore/shared';

const SERVERS_PREFIX = 'servers:';
const SETTINGS_KEY = 'settings:general';

// Sticky routing: alias -> serverId
const stickyRoutes = new Map<string, string>();

// Store the proxy server instance for dynamic start/stop
let proxyServerInstance: http.Server | null = null;
let proxyError: string | null = null; // in-memory error state

// Find a running server for the given alias
async function resolveServer(alias: string): Promise<IServer | null> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);

	// Filter to servers that have this alias
	const candidates = servers.filter(s =>
		(s.serverAlias ?? []).includes(alias)
	);

	if (candidates.length === 0) return null;

	// Check sticky route first
	const stickyId = stickyRoutes.get(alias);
	if (stickyId) {
		const sticky = candidates.find(s => s.id === stickyId && s.status === EServerStatus.RUNNING);
		if (sticky) return sticky;
		// Sticky server is gone, clear it
		stickyRoutes.delete(alias);
	}

	// Find a running server without error state
	const running = candidates.filter(s => s.status === EServerStatus.RUNNING);
	if (running.length === 0) return null;

	// Prefer servers without recent errors
	const healthy = running.filter(s => !s.error);
	const chosen = healthy.length > 0 ? healthy[0]! : running[0]!;

	// Set sticky route
	stickyRoutes.set(alias, chosen.id);
	return chosen;
}

// Get all unique aliases from all servers
async function getAllAliases(): Promise<string[]> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	const aliases = new Set<string>();
	for (const s of servers) {
		for (const a of (s.serverAlias ?? [])) aliases.add(a);
	}
	return [...aliases];
}

// Proxy a request to a llama-server, streaming the response through
function proxyRequest(
	targetPort: number,
	req: express.Request,
	res: express.Response,
): void {
	const options: http.RequestOptions = {
		hostname: '127.0.0.1',
		port: targetPort,
		path: req.originalUrl,
		method: req.method,
		headers: {
			...req.headers,
			host: `127.0.0.1:${targetPort}`,
		},
	};

	const proxyReq = http.request(options, (proxyRes) => {
		res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
		proxyRes.pipe(res, { end: true });
	});

	proxyReq.on('error', (err) => {
		if (!res.headersSent) {
			res.status(502).json({
				error: {
					message: `Failed to reach model server: ${err.message}`,
					type: 'proxy_error',
					code: 502,
				},
			});
		}
	});

	// Pipe request body through for POST requests
	req.pipe(proxyReq, { end: true });
}

// Extract model name from request body (for POST requests)
// Needs raw body parsing since we also pipe it through
function extractModelFromBody(req: express.Request): string | null {
	const body = req.body;
	if (body && typeof body === 'object' && typeof body.model === 'string') {
		return body.model;
	}
	return null;
}

export interface IStickyRouteInfo {
	alias: string;
	serverId: string;
	serverName: string | null; // null if server no longer exists
}

// Get sticky routes with resolved server names from store
export async function getStickyRoutesResolved(): Promise<IStickyRouteInfo[]> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	const serverMap = new Map(servers.map(s => [s.id, s.serverName]));

	const routes: IStickyRouteInfo[] = [];
	for (const [alias, serverId] of stickyRoutes.entries()) {
		routes.push({
			alias,
			serverId,
			serverName: serverMap.get(serverId) || null,
		});
	}
	return routes;
}

// Clear a specific sticky route by alias
export function clearStickyRoute(alias: string): boolean {
	return stickyRoutes.delete(alias);
}

// Clear all sticky routes
export function clearAllStickyRoutes(): void {
	stickyRoutes.clear();
}

// Create the proxy app (shared between start and restart)
function createProxyApp(): express.Express {
	const app = express();

	// Parse JSON body but keep it available for piping
	app.use((req, res, next) => {
		let rawBody = '';
		req.on('data', (chunk: Buffer) => { rawBody += chunk.toString(); });
		req.on('end', () => {
			try {
				if (rawBody) (req as any)._rawBody = rawBody;
				if (rawBody) req.body = JSON.parse(rawBody);
			} catch {
				req.body = {};
			}
			next();
		});
	});

	// GET /v1/models — list all available aliases
	app.get('/v1/models', async (_req, res) => {
		const aliases = await getAllAliases();
		res.json({
			object: 'list',
			data: aliases.map(alias => ({
				id: alias,
				object: 'model',
				created: 0,
				owned_by: 'warpcore',
			})),
		});
	});

	// Catch-all for /v1/* — route by model alias
	// Express 5 router uses different syntax - use a middleware approach
	app.use('/v1/', async (req, res, next) => {
		// Skip the /models endpoint which is handled separately
		if (req.path === '/models' || req.path.startsWith('/models')) {
			return next();
		}
		const model = extractModelFromBody(req);

		if (!model) {
			res.status(400).json({
				error: {
					message: 'Missing "model" field in request body',
					type: 'invalid_request_error',
					code: 400,
				},
			});
			return;
		}

		const server = await resolveServer(model);

		if (!server) {
			const allAliases = await getAllAliases();
			const aliasExists = allAliases.includes(model);

			res.status(aliasExists ? 503 : 404).json({
				error: {
					message: aliasExists
						? `No running server for model "${model}". Start a server with this alias first.`
						: `Unknown model "${model}". Available: ${allAliases.join(', ') || 'none'}`,
					type: aliasExists ? 'server_unavailable' : 'model_not_found',
					code: aliasExists ? 503 : 404,
				},
			});
			return;
		}

		// Re-create the request with raw body for piping
		// Since we consumed the body for parsing, we need to create a new request
		const rawBody = (req as any)._rawBody as string | undefined;

		const options: http.RequestOptions = {
			hostname: '127.0.0.1',
			port: server.port,
			path: req.originalUrl,
			method: req.method,
			headers: {
				'content-type': 'application/json',
				'accept': req.headers.accept ?? '*/*',
			},
		};

		const proxyReq = http.request(options, (proxyRes) => {
			// Copy all response headers
			const headers = { ...proxyRes.headers };
			res.writeHead(proxyRes.statusCode ?? 200, headers);
			// Stream response directly — no buffering
			proxyRes.pipe(res, { end: true });
		});

		proxyReq.on('error', (err) => {
			// Server might have died — clear sticky route
			stickyRoutes.delete(model);
			if (!res.headersSent) {
				res.status(502).json({
					error: {
						message: `Model server not responding: ${err.message}`,
						type: 'proxy_error',
						code: 502,
					},
				});
			}
		});

		// Write the raw body and end
		if (rawBody) {
			proxyReq.write(rawBody);
		}
		proxyReq.end();
	});

	// Health endpoint for the proxy itself
	app.get('/health', (_req, res) => {
		res.json({ status: 'ok', service: 'warpcore-proxy' });
	});

	return app;
}

export interface StartProxyResult {
	success: boolean;
	server?: http.Server;
	error?: string;
}

export async function startModelProxy(): Promise<StartProxyResult> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

	const app = createProxyApp();
	const port = settings.proxyPort ?? 1234;

	return new Promise((resolve) => {
		const server = app.listen(port, '0.0.0.0', () => {
			console.log(`[WarpCore] Model proxy listening on 0.0.0.0:${port}`);
			proxyServerInstance = server;
			proxyError = null;
			resolve({ success: true, server });
		});

		server.on('error', (err) => {
			const errorMsg = err.message || 'Unknown error';
			console.error(`[WarpCore] Model proxy failed to start: ${errorMsg}`);
			proxyError = errorMsg;
			resolve({ success: false, error: errorMsg });
		});
	});
}

export async function stopModelProxy(): Promise<void> {
	if (!proxyServerInstance) {
		proxyError = null;
		console.log('[WarpCore] Model proxy not running');
		return;
	}

	const server = proxyServerInstance;
	proxyServerInstance = null;
	proxyError = null;

	return new Promise((resolve) => {
		server.close(() => {
			console.log('[WarpCore] Model proxy stopped');
			resolve();
		});
	});
}

export function getModelProxyInstance(): http.Server | null {
	return proxyServerInstance;
}

export function getProxyError(): string | null {
	return proxyError;
}

export function isProxyOnline(): boolean {
	return proxyServerInstance !== null && proxyError === null;
}