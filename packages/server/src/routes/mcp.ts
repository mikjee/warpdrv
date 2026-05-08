// ============================================================
// MCP API routes — using bridge components
// ============================================================

import { Router } from 'express';
import { mcpClient, persistence, broadcaster } from '../index';
import type { IMcpConfigFile, IMcpServerEntry } from '@warpcore/shared';
import { EToolApprovalMode } from '@warpcore/bridge';
import type { IElicitationResponse } from '@warpcore/bridge';

export const mcpRouter = Router();

// ============================================================
// Config — keep using file-based config
// ============================================================
import { readMcpConfig, writeMcpConfig, addMcpServer, removeMcpServer, updateMcpServer, getMcpConfigPath } from '../util/mcpConfig';

mcpRouter.get('/config', (_req, res) => {
	try {
		res.json({ ok: true, data: readMcpConfig(), error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.put('/config', async (req, res) => {
	try {
		const config = req.body as IMcpConfigFile;
		if (!config || !config.mcpServers) {
			res.status(400).json({ ok: false, data: null, error: 'Invalid config' });
			return;
		}
		writeMcpConfig(config);
		// Disconnect servers removed from config
		const currentStates = mcpClient.getAllServerStates();
		for (const name of Object.keys(currentStates)) {
			if (!config.mcpServers[name]) {
				await mcpClient.disconnect(name);
			}
		}
		// Connect servers from new config
		for (const [name, entry] of Object.entries(config.mcpServers)) {
			await mcpClient.connect(name, entry);
		}
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.get('/config/path', (_req, res) => {
	res.json({ ok: true, data: getMcpConfigPath(), error: null });
});

// Server CRUD
mcpRouter.post('/servers', async (req, res) => {
	try {
		const { name, ...entry } = req.body as IMcpServerEntry & { name: string };
		if (!name) {
			res.status(400).json({ ok: false, data: null, error: 'Missing server name' });
			return;
		}
		const config = addMcpServer(name, entry);
		await mcpClient.connect(name, entry);
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.put('/servers/:name', async (req, res) => {
	try {
		const config = updateMcpServer(req.params.name, req.body as IMcpServerEntry);
		await mcpClient.reconnect(req.params.name);
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.delete('/servers/:name', async (req, res) => {
	try {
		const config = removeMcpServer(req.params.name);
		await mcpClient.disconnect(req.params.name);
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// Server lifecycle
mcpRouter.get('/status', (_req, res) => {
	res.json({ ok: true, data: mcpClient.getAllServerStates(), error: null });
});

mcpRouter.get('/status/:name', (req, res) => {
	const state = mcpClient.getServerState(req.params.name);
	if (!state) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}
	res.json({ ok: true, data: state, error: null });
});

mcpRouter.post('/servers/:name/restart', async (req, res) => {
	try {
		await mcpClient.reconnect(req.params.name);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.post('/servers/:name/refresh', async (req, res) => {
	try {
		await mcpClient.reconnect(req.params.name);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.post('/reload', async (req, res) => {
	try {
		const config = readMcpConfig();
		for (const [name, entry] of Object.entries(config.mcpServers)) {
			await mcpClient.reconnect(name);
		}
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Permissions — use bridge persistence
// ============================================================

mcpRouter.get('/permissions', async (_req, res) => {
	try {
		const serverPerms = await persistence.getAllServerPermissions();
		const toolPerms = await persistence.getAllToolPermissions();
		res.json({ ok: true, data: { servers: serverPerms, tools: toolPerms }, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.put('/permissions/server/:name', async (req, res) => {
	try {
		const { enabled } = req.body as { enabled: boolean };
		await persistence.setServerPermission(req.params.name, enabled);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.put('/permissions/tool', async (req, res) => {
	try {
		const { serverName, toolName, enabled, approvalMode } = req.body as {
			serverName: string;
			toolName: string;
			enabled: boolean;
			approvalMode: EToolApprovalMode;
		};
		await persistence.setToolPermission(serverName, toolName, enabled, approvalMode);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// Tool calls
mcpRouter.get('/tool-calls/pending', async (_req, res) => {
	try {
		const pending = await persistence.getPendingToolCalls();
		res.json({ ok: true, data: pending, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.get('/tool-calls/thread/:threadId', async (req, res) => {
	try {
		const calls = await persistence.getToolCallsForThread(req.params.threadId);
		res.json({ ok: true, data: calls, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// Attached tools
mcpRouter.get('/attached-tools/thread/:threadId', async (req, res) => {
	try {
		const attached = await persistence.getThreadAttachedTools(req.params.threadId);
		res.json({ ok: true, data: attached, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

mcpRouter.post('/elicitation/:id/respond', async (req, res) => {
	const { id } = req.params;
	const response = req.body as IElicitationResponse;
	const ok = mcpClient.elicitationRegistry.resolve(id, response);
	if (!ok) {
		res.status(404).json({ error: 'Elicitation not found or already resolved' });
		return;
	}
	broadcaster.emit({ type: 'elicitation_resolved', id });
	res.json({ ok: true });
});
