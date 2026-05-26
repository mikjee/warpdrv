import { Router } from 'express';
import crypto from 'crypto';
import { persistence, orchestrator, broadcaster } from '../index';
import { store } from '../util/store';
import type { IChatThreadCreatePayload, IChatMessageCreatePayload } from '@warpcore/shared';
import { EChatRole, EMessagePartType, ICompletionRequest, type IFolder } from '@warpcore/bridge';
import type { IServer } from '@warpcore/shared';

export const chatRouter = Router();
const activeAborts = new Map<string, AbortController>();

// ============================================================
// Threads
// ============================================================

// GET /api/chat/threads
chatRouter.get('/threads', async (req, res) => {
	try {
		const query = req.query.query as string | undefined;
		const folderId = req.query.folderId as string | undefined;
		const options: Record<string, unknown> = {};
		if (query) options.query = query;
		if (folderId !== undefined) options.folderId = folderId === 'null' ? null : folderId;
		const threads = await persistence.listThreads(options);
		res.json({ ok: true, data: threads, total: threads.length, error: null });
	} catch (err) {
		console.error('[Server] GET /api/chat/threads - error:', err);
		res.status(500).json({ ok: false, data: [], total: 0, error: String(err) });
	}
});

	// POST /api/chat/threads
	chatRouter.post('/threads', async (req, res) => {
		try {
			const body = req.body as IChatThreadCreatePayload;
			const now = Date.now();
			const thread = await persistence.createThread({
				id: body.id ?? crypto.randomUUID(),
				title: body.title ?? 'New Chat',
				folderId: body.folderId ?? null,
				systemPrompt: body.systemPrompt ?? '',
				meta: JSON.stringify({ serverId: body.serverId ?? null, whisperServerId: body.whisperServerId ?? null, tags: body.tags ?? [] }),
				totalPromptTokens: body.totalPromptTokens ?? 0,
				totalCompletionTokens: body.totalCompletionTokens ?? 0,
				createdAt: now,
				updatedAt: now,
			});
			res.json({ ok: true, data: null, error: null });
		} catch (err) {
			res.status(500).json({ ok: false, data: null, error: String(err) });
		}
	});

// GET /api/chat/threads/:id
chatRouter.get('/threads/:id', async (req, res) => {
	try {
		const thread = await persistence.getThread(req.params.id);
		if (!thread) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		const messages = await persistence.getMessages(req.params.id);
		res.json({ ok: true, data: { ...thread, messages }, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/chat/threads/:id
chatRouter.put('/threads/:id', async (req, res) => {
	try {
		const thread = await persistence.getThread(req.params.id);
		if (!thread) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		const body = req.body as Partial<IChatThreadCreatePayload>;
		const meta = JSON.parse(thread.meta || '{}');
		const strMeta = JSON.stringify({
			serverId: body.serverId ?? meta.serverId,
			whisperServerId: body.whisperServerId ?? meta.whisperServerId,
			tags: body.tags ?? meta.tags,
		});

		await persistence.updateThread(req.params.id, {
			title: body.title ?? thread.title,
			folderId: body.folderId ?? thread.folderId,
			systemPrompt: body.systemPrompt ?? thread.systemPrompt,
			meta: strMeta,
		});

		// Emit SSE event for all clients
		broadcaster.emit({
			type: 'thread.updated',
			threadId: req.params.id,
			updates: {
				title: body.title ?? undefined,
				folderId: body.folderId ?? undefined,
				meta: strMeta,
			},
		});

		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/chat/threads/:id
chatRouter.delete('/threads/:id', async (req, res) => {
	try {
		await persistence.deleteThread(req.params.id);
		broadcaster.emit({
			type: 'thread.deleted',
			threadId: req.params.id,
		});
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Messages
// ============================================================

// POST /api/chat/threads/:id/messages
chatRouter.post('/threads/:id/messages', async (req, res) => {
	try {
		const threadId = req.params.id;
		const thread = await persistence.getThread(threadId);
		if (!thread) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		const payloads: IChatMessageCreatePayload[] = Array.isArray(req.body) ? req.body : [req.body];
		const now = Date.now();
	const messages = payloads.map((p, i) => ({
		id: p.id ?? crypto.randomUUID(),
		parentId: p.parentId ?? null,
		threadId,
		role: p.role as EChatRole,
		content: p.content,
		stats: p.stats ? JSON.parse(p.stats) : null,
		createdAt: now + i,
	}));
		for (const msg of messages) {
			try {
				await persistence.createMessage(msg);
			} catch (err) {
				// Likely PRIMARY KEY conflict — message already saved. Ignore.
				if (!String(err).includes('UNIQUE') && !String(err).includes('PRIMARY')) throw err;
			}
		}
		res.json({ ok: true, data: messages, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Folders
// ============================================================

chatRouter.get('/folders', async (_req, res) => {
	try {
		const folders = await persistence.listFolders();
		res.json({ ok: true, data: folders, total: folders.length, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: [], total: 0, error: String(err) });
	}
});

chatRouter.post('/folders', async (req, res) => {
		try {
			const { name, parentId, sortOrder } = req.body;
			const folder: IFolder = {
				id: crypto.randomUUID(),
				name: name || 'New Folder',
				parentId: parentId ?? null,
				sortOrder: sortOrder ?? 0,
				createdAt: Date.now(),
			};
			await persistence.createFolder(folder);
			res.json({ ok: true, data: folder, error: null });
		} catch (err) {
			res.status(500).json({ ok: false, data: null, error: String(err) });
		}
	});

chatRouter.put('/folders/:id', async (req, res) => {
		try {
			const { name, parentId, sortOrder } = req.body;
			await persistence.updateFolder(req.params.id, { name, parentId, sortOrder });
			res.json({ ok: true, data: null, error: null });
		} catch (err) {
			res.status(500).json({ ok: false, data: null, error: String(err) });
		}
	});

chatRouter.delete('/folders/:id', async (req, res) => {
	try {
		await persistence.deleteFolder(req.params.id);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Presets & Configs — keep existing JSON file handlers
// ============================================================
import {
	listChatPresets,
	getChatPreset,
	createChatPreset,
	updateChatPreset,
	deleteChatPreset,
} from '../util/chatPresets';
import type { IChatPresetCreatePayload } from '@warpcore/shared';

chatRouter.get('/presets', (_req, res) => {
	try {
		const presets = listChatPresets();
		res.json({ ok: true, data: presets, total: presets.length, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.get('/presets/:id', (req, res) => {
	try {
		const preset = getChatPreset(req.params.id);
		if (!preset) return res.status(404).json({ ok: false, data: null, error: 'Not found' });
		res.json({ ok: true, data: preset, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.post('/presets', (req, res) => {
	try {
		const preset = createChatPreset(req.body as IChatPresetCreatePayload);
		res.json({ ok: true, data: preset, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/presets/:id', (req, res) => {
	try {
		const preset = updateChatPreset(req.params.id, req.body as Partial<IChatPresetCreatePayload>);
		if (!preset) return res.status(404).json({ ok: false, data: null, error: 'Not found' });
		res.json({ ok: true, data: preset, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.delete('/presets/:id', (req, res) => {
	try {
		const ok = deleteChatPreset(req.params.id);
		if (!ok) return res.status(404).json({ ok: false, data: null, error: 'Not found' });
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// Thread configs via bridge persistence
chatRouter.get('/threads/:id/config', async (req, res) => {
	try {
		const config = await persistence.getThreadConfig(req.params.id);
		res.json({ ok: true, data: config, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/threads/:id/config', async (req, res) => {
	try {
		const body = req.body as { presetId?: string | null; systemPrompt?: string; params?: string };
		await persistence.setThreadConfig({
			threadId: req.params.id,
			presetId: body.presetId ?? null,
			systemPrompt: body.systemPrompt ?? '',
			params: body.params ?? '{}',
		});
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Completions — use bridge orchestrator
// ============================================================

chatRouter.post('/completions', async (req, res) => {
	const body = req.body as any;
	if (!body.threadId) {
		res.status(400).json({ ok: false, data: null, error: 'Missing required fields' });
		return;
	}

	const abortController = new AbortController();
	// Cancel any previous in-flight completion for this thread
	const previous = activeAborts.get(body.threadId);
	if (previous) previous.abort();
	activeAborts.set(body.threadId, abortController);

	const server = await store.get<IServer>('servers:' + body.serverId);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}
	const inferenceUrl = `http://127.0.0.1:${server.port}`;

	// Fire and forget — return immediately, all updates flow via broadcaster
	res.json({ ok: true, data: null, error: null });

	orchestrator.handleCompletionV2(inferenceUrl, body, abortController.signal)
		.catch(err => {
			console.error('[Completions] orchestrator error:', err);
		})
		.finally(() => {
			if (activeAborts.get(body.threadId) === abortController) {
				activeAborts.delete(body.threadId);
			}
		});
});

// POST /api/chat/cancel/:threadId — cancel in-flight completion
chatRouter.post('/cancel/:threadId', (req, res) => {
	const ac = activeAborts.get(req.params.threadId);
	if (ac) {
		ac.abort();
		activeAborts.delete(req.params.threadId);
		res.json({ ok: true, data: null, error: null });
	} else {
		res.json({ ok: true, data: null, error: 'No active completion' });
	}
});

// GET /api/chat/events — global SSE channel for all bridge events
chatRouter.get('/events', async (req, res) => {
	console.log('[Chat SSE] New client connection');
	const { createSession } = await import('better-sse');
	const session = await createSession(req, res);
	const channel = (broadcaster as any).getChannel();
	channel.register(session);
	console.log('[Chat SSE] Session registered to broadcaster channel');
	
	// Keep connection alive until client disconnects
	await new Promise<void>((resolve) => {
		req.on('close', () => {
			console.log('[Chat SSE] Client disconnected');
			resolve();
		});
		req.on('error', (err) => {
			console.error('[Chat SSE] Connection error:', err);
			resolve();
		});
	});
});

// PUT /api/chat/messages/:id — edit message parts, no inference
chatRouter.put('/messages/:id', async (req, res) => {
	try {
		const messageId = req.params.id;
		const msg = await persistence.getMessage(messageId);
		if (!msg) {
			res.status(404).json({ ok: false, data: null, error: 'Message not found' });
			return;
		}
		const { parts } = req.body as { parts: any[] };
		if (!parts || !Array.isArray(parts)) {
			res.status(400).json({ ok: false, data: null, error: 'Missing parts array' });
			return;
		}
		await persistence.replaceMessageParts(messageId, parts);
		
		// Emit SSE event for all clients
		broadcaster.emit({
			type: 'message.patched',
			messageId,
			threadId: msg.threadId,
			updates: { replaceParts: parts },
		});
		
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/chat/messages/:id — delete a message
chatRouter.delete('/messages/:id', async (req, res) => {
	try {
		const messageId = req.params.id;
		const msg = await persistence.getMessage(messageId);
		if (!msg) {
			res.status(404).json({ ok: false, data: null, error: 'Message not found' });
			return;
		}
		const threadId = msg.threadId;
		
		// Delete the message from database
		await persistence.deleteMessage(messageId);
		
		// Emit SSE event for all clients
		broadcaster.emit({
			type: 'message.deleted',
			messageId,
			threadId,
		});
		
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/chat/folders/reorder — batch update folder sort orders
chatRouter.put('/folders/reorder', async (req, res) => {
	try {
		const { updates } = req.body as { updates: Array<{ id: string; sortOrder: number }> };
		if (!updates || !Array.isArray(updates)) {
			res.status(400).json({ ok: false, data: null, error: 'Missing updates array' });
			return;
		}
		await persistence.reorderFolders(updates);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.post('/tool-calls/:id/resume', async (req, res) => {
	const { decision, threadId, serverId, systemPrompt, inferenceParams, attachAllTools, attachedTools } = req.body as {
		decision: 'approve' | 'deny';
		threadId: string;
		serverId: string;
		systemPrompt?: string;
		inferenceParams: Record<string, unknown>;
		attachAllTools?: boolean;
		attachedTools?: any[];
	};

	if (decision !== 'approve' && decision !== 'deny') {
		res.status(400).json({ ok: false, data: null, error: 'Invalid decision' });
		return;
	}
	if (!threadId || !serverId) {
		res.status(400).json({ ok: false, data: null, error: 'Missing threadId or serverId' });
		return;
	}

	// Look up inference URL from server
	const server = await store.get<IServer>('servers:' + serverId);
	if (!server) {
		res.status(404).json({ ok: false, data: null, error: 'Server not found' });
		return;
	}
	const inferenceUrl = `http://127.0.0.1:${server.port}`;

	const completionRequest: ICompletionRequest = {
		threadId,
		serverId,
		systemPrompt,
		inferenceParams: inferenceParams as any,
		attachAllTools,
		attachedTools,
	};

	// Track abort for this resume — same pattern as completions route
	const abortController = new AbortController();
	const previous = activeAborts.get(threadId);
	if (previous) previous.abort();
	activeAborts.set(threadId, abortController);

	// Fire-and-forget — return immediately, all updates flow via broadcaster
	res.json({ ok: true, data: null, error: null });

	orchestrator.resumeToolCallV2(req.params.id, decision, inferenceUrl, completionRequest, abortController.signal)
		.catch(err => {
			console.error('[Resume] orchestrator error:', err);
		})
		.finally(() => {
			if (activeAborts.get(threadId) === abortController) {
				activeAborts.delete(threadId);
			}
		});
});