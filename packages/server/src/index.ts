import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { store } from './util/store';
import { settingsRouter } from './routes/settings';
import { backendsRouter } from './routes/backends';
import { backendGroupsRouter } from './routes/backendGroups';
import { modelsRouter, loadCachedModels } from './routes/models';
import { serversRouter, reconcileServers, launchAutoStartServers } from './routes/servers';
import { presetsRouter } from './routes/presets';
import { hubRouter } from './routes/hub';
import { tokensRouter } from './routes/tokens';
import { authRouter } from './routes/auth';
import { authMiddleware } from './middleware/auth';
import type { ISettings, IServer, IDownload, IDevice, IBackend, IBackendGroup } from '@warpcore/shared';
import type { TBackendId, TBackendGroupId } from '@warpcore/shared';
import { DEFAULT_SETTINGS, EServerStatus, EDownloadStatus } from '@warpcore/shared';
import { runMigrations } from './services/migrationRunner';
import { updateRouter } from './routes/update';
import { chatRouter } from './routes/chat';
import { mcpRouter } from './routes/mcp';
import { proxyRouter } from './routes/proxy';
import { startModelProxy, getProxyStatus } from './services/modelProxy';
import { summaryRouter } from './routes/summary';
import { sseManager } from './services/sseManagerInstance';
import { getAllServerStats, getServerStats } from './services/statsPoller';
import { getAllDownloads, getAllDownloadsRecord } from './services/downloadManager';
import { SqlitePersistence, McpClientManager, McpConfig, PermissionManager, Orchestrator, SseBroadcaster } from '@warpcore/bridge/server';
import path from 'path';
import os from 'os';

const SETTINGS_KEY = 'settings:general';

// Bridge components - exported for routes to use
export let persistence: SqlitePersistence;
export let mcpClient: McpClientManager;
export let orchestrator: Orchestrator;
export let mcpConfig: McpConfig;
export let broadcaster: SseBroadcaster;

import { execSync } from 'child_process';

function resolveShellPath(): string | null {
	try {
		const shell = process.env.SHELL || '/bin/bash';
		const out = execSync(`${shell} -ilc 'echo $PATH'`, {
			encoding: 'utf8',
			timeout: 3000,
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
		return out || null;
	} catch {
		return null;
	}
}

async function main() {
	
	const shellPath = resolveShellPath();
	if (shellPath && shellPath !== process.env.PATH) {
		console.log('[debug] resolved shell PATH:', shellPath);
		process.env.PATH = shellPath;
	}

	console.log('[debug] PATH:', process.env.PATH || '(not set)');
	console.log('[debug] HOME:', process.env.HOME || '(not set)');
	console.log('[debug] RESOURCE_DIR:', process.env.RESOURCE_DIR);
	console.log('[debug] execPath:', process.execPath);
	console.log('[debug] pkg:', (process as any).pkg);
	await runMigrations();

	// Ensure default settings exist
	const settings = await store.get<ISettings>(SETTINGS_KEY);
	if (!settings) await store.put(SETTINGS_KEY, DEFAULT_SETTINGS);

	// Reconcile any servers that were running before restart
	await reconcileServers();

	// Initialize bridge persistence
	const dataDir = path.join(os.homedir(), '.config', 'warpcore');
	persistence = new SqlitePersistence(path.join(dataDir, 'chat.db'));
	await persistence.init();

	// Initialize MCP
	mcpConfig = new McpConfig(path.join(dataDir, 'mcp.json'));
	mcpClient = new McpClientManager();
	const permissions = new PermissionManager(persistence);
	broadcaster = new SseBroadcaster();
	orchestrator = new Orchestrator({ mcpClient, permissions, persistence, broadcaster });

	// Connect MCP servers from config
	const mcpCfg = mcpConfig.read();
	for (const [name, entry] of Object.entries(mcpCfg.mcpServers)) {
		await mcpClient.connect(name, entry);
	}

	// Pending approvals will be handled by the orchestrator on next completion

	// Load cached model scan results
	await loadCachedModels();

	// Launch auto-start servers after all data has loaded
	await launchAutoStartServers();

	const app = express();

	app.use(cors());
	app.use(express.json());
	app.use(cookieParser());
	// Auth routes (no middleware - public endpoints)
	app.use('/api/auth', authRouter);
	// Token routes (require admin auth)
	app.use('/api/tokens', authMiddleware, tokensRouter);
	// API routes with auth middleware
	app.use('/api/settings', authMiddleware, settingsRouter);
	app.use('/api/backends', authMiddleware, backendsRouter);
	app.use('/api/backend-groups', authMiddleware, backendGroupsRouter);
	app.use('/api/models', authMiddleware, modelsRouter);
	app.use('/api/servers', authMiddleware, serversRouter);
	app.use('/api/presets', authMiddleware, presetsRouter);
	app.use('/api/hub', authMiddleware, hubRouter);
	app.use('/api/update', authMiddleware, updateRouter);
	app.use('/api/proxy', authMiddleware, proxyRouter);
	app.use('/api/chat', authMiddleware, chatRouter);
	app.use('/api/mcp', authMiddleware, mcpRouter);
	app.use('/api/summary', authMiddleware, summaryRouter);
	// SSE endpoint (protected by auth)
	app.get('/api/events', authMiddleware, async (req, res) => {
		console.log('[SSE] New client');
		await sseManager.handleConnection(req, res, () => {
			console.log('[SSE] Client disconnected');
		});
	});

	// Stats endpoint — returns live stats for a running server (protected by auth)
	app.get('/api/servers/:id/stats', authMiddleware, (req, res) => {
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
		console.log('[SSE] Start channels..');

		// Phase 1: Servers
		const SERVERS_PREFIX = 'servers:';

		sseManager.onConnect('servers:list', async () => {
			const servers = await store.list<IServer>(`${SERVERS_PREFIX}`);
			const result: Record<string, IServer> = {};
			for (const s of servers) {
				result[s.id] = { ...s, stats: (s.status === EServerStatus.RUNNING || s.status === EServerStatus.LOADING) ? getServerStats(s.id) : null };
			}
			return result;
		});

		sseManager.onInterval('servers:stats', () => {
			const stats = getAllServerStats();
			return Object.keys(stats).length > 0 ? stats : null;
		}, 1500);

		// Phase 1: Proxy
		sseManager.onConnect('proxy:init', async () => {
			return await getProxyStatus();
		});

		// Phase 1: Downloads
		sseManager.onConnect('downloads:init', async () => {
			const downloads = await getAllDownloads();
			return downloads.reduce((acc, dl) => {
				acc[dl.id] = dl;
				return acc;
			}, {} as Record<string, IDownload>);
		});

		sseManager.onInterval('downloads:progress', () => {
			const all = getAllDownloadsRecord();
			const active: Record<string, IDownload> = {};
			for (const id of Object.keys(all)) {
				const dl = all[id];
				if (!dl) continue;
				if (dl.status === EDownloadStatus.DOWNLOADING || dl.status === EDownloadStatus.PAUSED) {
					active[id] = dl;
				}
			}
			return Object.keys(active).length > 0 ? active : null;
		}, 1000);

		// Phase 1: Devices
		const BACKENDS_PREFIX = 'backends:';

		sseManager.onConnect('devices:init', async () => {
			const backends = await store.list<IBackend>(BACKENDS_PREFIX);
			return backends.flatMap(b => b.detectedDevices ?? []);
		});

		sseManager.onInterval('devices:vram', async () => {
			const backends = await store.list<IBackend>(BACKENDS_PREFIX);
			const devices = backends.flatMap(b => b.detectedDevices ?? []);
			return devices.length > 0 ? devices : [];
		}, 5000);

		// Phase 2: MCP
		sseManager.onConnect('mcp:init', async () => {
			return mcpClient.getAllServerStates();
		});

		sseManager.onInterval('mcp:servers', () => {
			const states = mcpClient.getAllServerStates();
			return Object.keys(states).length > 0 ? states : null;
		}, 1000);

		// Phase 1: Backends
		sseManager.onConnect('backends:init', async () => {
			const backends = await store.list<IBackend>(BACKENDS_PREFIX);
			return backends.reduce((acc, b) => {
				acc[b.id] = b;
				return acc;
			}, {} as Record<TBackendId, IBackend>);
		});

		// Phase 1: Backend Groups
		const BACKEND_GROUPS_PREFIX = 'backendGroups:';

		sseManager.onConnect('backend-groups:init', async () => {
			const groups = await store.list<IBackendGroup>(BACKEND_GROUPS_PREFIX);
			return groups.reduce((acc, g) => {
				acc[g.id] = g;
				return acc;
			}, {} as Record<TBackendGroupId, IBackendGroup>);
		});

	}

	registerSSEChannels();

	app.listen(port, host, () => {
		console.log(`[WarpCore] API server listening on ${host}:${port}`);
		if (envPort) {
			console.log(`[WarpCore] Port set via CONTROL_API_PORT environment variable`);
		}
	});

	process.on('exit', () => { mcpClient.disconnectAll(); });

	// Start model proxy if enabled in settings
	if (currentSettings.proxyEnabled) {
		await startModelProxy();
	}
}

main().catch(err => {
	console.error('[WarpCore] Fatal error:', err);
	process.exit(1);
});
