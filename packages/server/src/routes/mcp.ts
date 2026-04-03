// ============================================================
// FILE: packages/server/src/routes/mcp.ts
// MCP API routes — config, server lifecycle, permissions,
// tool call approvals
// ============================================================

import { Router } from 'express';
import {
	readMcpConfig,
	writeMcpConfig,
	addMcpServer,
	removeMcpServer,
	updateMcpServer,
	getMcpConfigPath,
} from '../util/mcpConfig';
import {
	getAllMcpServerStates,
	getMcpServerState,
	reloadMcpClients,
	restartMcpServer,
	refreshMcpServerTools,
} from '../services/mcpClientManager';
import { mcpDb } from '../util/chatDB';
import { resolveToolCallApproval } from '../services/chatCompletionService';
import type { IMcpServerEntry, IToolPermission } from '@warpcore/shared';
import { EToolApprovalMode } from '@warpcore/shared';

export const mcpRouter = Router();

// ============================================================
// Config — read/write mcp.json
// ============================================================

// GET /api/mcp/config — get full mcp.json contents
mcpRouter.get('/config', (_req, res) => {
	try {
		const config = readMcpConfig();
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/mcp/config — overwrite full mcp.json
mcpRouter.put('/config', async (req, res) => {
	try {
		const config = req.body;
		if (!config || !config.mcpServers) {
			res.status(400).json({ ok: false, data: null, error: 'Invalid config: missing mcpServers' });
			return;
		}
		writeMcpConfig(config);
		// Reload clients to pick up changes
		await reloadMcpClients();
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// GET /api/mcp/config/path — get the file path for mcp.json
mcpRouter.get('/config/path', (_req, res) => {
	res.json({ ok: true, data: getMcpConfigPath(), error: null });
});

// ============================================================
// Server entries — CRUD on individual servers in mcp.json
// ============================================================

// POST /api/mcp/servers — add a new server to mcp.json
mcpRouter.post('/servers', async (req, res) => {
	try {
		const { name, ...entry } = req.body as IMcpServerEntry & { name: string };
		if (!name) {
			res.status(400).json({ ok: false, data: null, error: 'Missing server name' });
			return;
		}
		const config = addMcpServer(name, entry);
		await reloadMcpClients();
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/mcp/servers/:name — update a server entry
mcpRouter.put('/servers/:name', async (req, res) => {
	try {
		const name = req.params.name;
		const entry = req.body as IMcpServerEntry;
		const config = updateMcpServer(name, entry);
		await reloadMcpClients();
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/mcp/servers/:name — remove a server from mcp.json
mcpRouter.delete('/servers/:name', async (req, res) => {
	try {
		const name = req.params.name;
		const config = removeMcpServer(name);
		await reloadMcpClients();
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Server lifecycle — status, restart, refresh tools
// ============================================================

// GET /api/mcp/status — get all server states
mcpRouter.get('/status', (_req, res) => {
	const states = getAllMcpServerStates();
	res.json({ ok: true, data: states, error: null });
});

// GET /api/mcp/status/:name — get a specific server state
mcpRouter.get('/status/:name', (req, res) => {
	const state = getMcpServerState(req.params.name);
	if (!state) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}
	res.json({ ok: true, data: state, error: null });
});

// POST /api/mcp/servers/:name/restart — restart a server
mcpRouter.post('/servers/:name/restart', async (req, res) => {
	try {
		await restartMcpServer(req.params.name);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// POST /api/mcp/servers/:name/refresh — refresh tool list
mcpRouter.post('/servers/:name/refresh', async (req, res) => {
	try {
		await refreshMcpServerTools(req.params.name);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// POST /api/mcp/reload — reload all servers from config
mcpRouter.post('/reload', async (_req, res) => {
	try {
		await reloadMcpClients();
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Permissions — server-level and tool-level
// ============================================================

// GET /api/mcp/permissions — get all permissions
mcpRouter.get('/permissions', async (_req, res) => {
	try {
		const serverPerms = await mcpDb.getAllServerPermissions();
		const toolPerms = await mcpDb.getAllToolPermissions();
		res.json({ ok: true, data: { servers: serverPerms, tools: toolPerms }, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/mcp/permissions/server/:name — set server enabled/disabled
mcpRouter.put('/permissions/server/:name', async (req, res) => {
	try {
		const { enabled } = req.body as { enabled: boolean };
		await mcpDb.setServerPermission(req.params.name, enabled);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/mcp/permissions/tool — set tool permission
mcpRouter.put('/permissions/tool', async (req, res) => {
	try {
		const { serverName, toolName, enabled, approvalMode } = req.body as {
			serverName: string;
			toolName: string;
			enabled: boolean;
			approvalMode: EToolApprovalMode;
		};
		await mcpDb.setToolPermission(serverName, toolName, enabled, approvalMode);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Tool call approvals
// ============================================================

// POST /api/mcp/tool-calls/:id/decide — approve or deny a pending tool call
mcpRouter.post('/tool-calls/:id/decide', async (req, res) => {
	try {
		const { decision } = req.body as { decision: 'approve' | 'deny' };
		if (decision !== 'approve' && decision !== 'deny') {
			res.status(400).json({ ok: false, data: null, error: 'Invalid decision. Must be "approve" or "deny".' });
			return;
		}

		const resolved = resolveToolCallApproval(req.params.id, decision);
		if (!resolved) {
			res.status(404).json({ ok: false, data: null, error: 'No pending approval found for this tool call' });
			return;
		}
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// GET /api/mcp/tool-calls/pending — get all pending tool calls
mcpRouter.get('/tool-calls/pending', async (_req, res) => {
	try {
		const pending = await mcpDb.getPendingToolCalls();
		res.json({ ok: true, data: pending, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// GET /api/mcp/tool-calls/thread/:threadId — get tool calls for a thread
mcpRouter.get('/tool-calls/thread/:threadId', async (req, res) => {
	try {
		const calls = await mcpDb.getToolCallsForThread(req.params.threadId);
		res.json({ ok: true, data: calls, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});
