import { Router } from 'express';
import crypto from 'crypto';
import { createSession } from 'better-sse';
import { persistence, orchestrator, broadcaster } from '../index';
import { store } from '../util/store';
import { sseManager } from '../services/sseManagerInstance';
import type { IChatThreadCreatePayload, IChatMessageCreatePayload } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { EChatRole, EMessagePartType, ICompletionRequest, type IFolder } from '@warpcore/bridge';
import { folderNameToTopic } from '@warpcore/bridge/util/topic';
import type { IServer } from '@warpcore/shared';
import { embeddingManager } from '../services/embeddingManager';

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
				meta: JSON.stringify({ serverId: body.serverId ?? null, whisperServerId: body.whisperServerId ?? null, tags: body.tags ?? [], enableAutoEmbed: body.enableAutoEmbed ?? false }),
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

// GET /api/chat/threads/:threadId/embeddings
chatRouter.get('/threads/:threadId/embeddings', async (req, res) => {
	try {
		const threadId = req.params.threadId;
		const serverId = req.query.serverId as string;
		if (!serverId) {
			res.status(400).json({ ok: false, data: null, error: 'serverId required' });
			return;
		}
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) {
			res.status(404).json({ ok: false, data: null, error: 'Server not found' });
			return;
		}
		const thread = await persistence.getThread(threadId);
		const folderId = thread?.folderId;
		const topic = folderId ? (await persistence.getFolder(folderId))?.topic ?? 'global' : 'global';
		const statuses = await persistence.getThreadEmbeddingStatuses(threadId, server.modelPath, topic);
		res.json({ ok: true, data: { messageIds: Array.from(statuses) }, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// POST /api/chat/embedding/configure
chatRouter.post('/embedding/configure', async (req, res) => {
	try {
		const { serverId } = req.body as { serverId: string };
		if (!serverId) {
			return res.status(400).json({ ok: false, error: 'serverId required' });
		}
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) {
			return res.status(404).json({ ok: false, error: 'Server not found' });
		}
		if (server.status !== EServerStatus.RUNNING) {
			return res.status(400).json({ ok: false, error: 'Server not running' });
		}
		await embeddingManager.configure(serverId);
		res.json({ ok: true, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, error: String(err) });
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
			enableAutoEmbed: body.enableAutoEmbed ?? meta.enableAutoEmbed,
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
		const threadId = req.params.id;
		const embeddings = await persistence.deleteThreadCascade(threadId);
		await embeddingManager.deleteEmbeddingsForThread(embeddings);
		broadcaster.emit({
			type: 'thread.deleted',
			threadId,
		});
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// FTS Search
// ============================================================

// GET /api/chat/search
chatRouter.get('/search', async (req, res) => {
	try {
		const q = req.query.q as string;
		const mode = req.query.mode as string;
		const threadId = req.query.threadId as string | undefined;
		const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
		const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

		if (!q || !q.trim()) {
			return res.json({ ok: true, data: [], total: 0, error: null });
		}
		if (!mode || !['everywhere', 'threads', 'thread'].includes(mode)) {
			return res.status(400).json({ ok: false, data: null, error: 'Invalid or missing mode' });
		}
		if (mode === 'thread' && !threadId) {
			return res.status(400).json({ ok: false, data: null, error: 'threadId required for thread mode' });
		}

		if (mode === 'threads') {
			const data = await persistence.searchThreads(q, { limit, offset });
			return res.json({ ok: true, data, total: data.length, error: null });
		}

		const data = await persistence.searchMessages(q, { mode: mode as 'everywhere' | 'thread', threadId, limit, offset });
		res.json({ ok: true, data, total: data.length, error: null });
	} catch (err) {
		console.error('[Server] GET /api/chat/search - error:', err);
		res.status(500).json({ ok: false, data: [], total: 0, error: String(err) });
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

// POST /api/chat/messages/:messageId/embed
chatRouter.post('/messages/:messageId/embed', async (req, res) => {
	try {
		const messageId = req.params.messageId;
		const message = await persistence.getMessage(messageId);
		if (!message) {
			return res.status(404).json({ ok: false, data: null, error: 'Message not found' });
		}
		const folderId = message.threadId ? (await persistence.getThread(message.threadId))?.folderId : null;
		const topic = folderId ? (await persistence.getFolder(folderId))?.topic ?? 'global' : 'global';
		console.log('[embedding] POST embed:', messageId, topic);
		await embeddingManager.embedMessage(messageId, topic);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		console.error('[embedding] POST embed error:', err);
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/chat/messages/:messageId/embed
chatRouter.delete('/messages/:messageId/embed', async (req, res) => {
	try {
		const messageId = req.params.messageId;
		const message = await persistence.getMessage(messageId);
		if (!message) {
			return res.status(404).json({ ok: false, data: null, error: 'Message not found' });
		}
		const folderId = message.threadId ? (await persistence.getThread(message.threadId))?.folderId : null;
		const topic = folderId ? (await persistence.getFolder(folderId))?.topic ?? 'global' : 'global';
		console.log('[embedding] DELETE embed:', messageId, topic);
		await embeddingManager.deleteEmbeddingForMessage(messageId, message.threadId);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		console.error('[embedding] DELETE embed error:', err);
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
			const folderName = name || 'New Folder';
			const topic = folderNameToTopic(folderName);
			const unique = await persistence.isTopicUnique(topic);
			if (!unique) {
				return res.status(409).json({ ok: false, data: null, error: `Topic "${topic}" already exists` });
			}
			const folder: IFolder = {
				id: crypto.randomUUID(),
				name: folderName,
				topic,
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

chatRouter.put('/folders/:id/topic', async (req, res) => {
		try {
			const { topic } = req.body as { topic: string };
			if (!topic) {
				return res.status(400).json({ ok: false, data: null, error: 'Topic is required' });
			}
			const folder = await persistence.getFolder(req.params.id);
			if (!folder) {
				return res.status(404).json({ ok: false, data: null, error: 'Folder not found' });
			}
			if (topic === folder.topic) {
				return res.json({ ok: true, data: null, error: null });
			}
			const unique = await persistence.isTopicUnique(topic, req.params.id);
			if (!unique) {
				return res.status(409).json({ ok: false, data: null, error: `Topic "${topic}" already exists or is reserved` });
			}
			const oldTopic = folder.topic;
			await persistence.updateFolder(req.params.id, { topic });
			await embeddingManager.renameTopic(oldTopic, topic);
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
// Workspaces
// ============================================================

chatRouter.post('/workspaces/:folderId', async (req, res) => {
	try {
		const { data } = req.body as { data: Record<string, unknown> };
		await persistence.createWorkspace({ folderId: req.params.folderId, data: data ?? {} });
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.get('/workspaces/:folderId', async (req, res) => {
	try {
		const workspace = await persistence.getWorkspace(req.params.folderId);
		res.json({ ok: true, data: workspace, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/workspaces/:folderId', async (req, res) => {
	try {
		const { data } = req.body as { data: Record<string, unknown> };
		await persistence.updateWorkspace(req.params.folderId, data);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.delete('/workspaces/:folderId', async (req, res) => {
	try {
		await persistence.deleteWorkspace(req.params.folderId);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Persisted States
// ============================================================

chatRouter.get('/workspaces/:folderId/state', async (req, res) => {
	try {
		const data = await persistence.getWorkspaceState(req.params.folderId);
		res.json({ ok: true, data, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/workspaces/:folderId/state', async (req, res) => {
	try {
		const { data } = req.body as { data: Record<string, unknown> };
		await persistence.updateWorkspaceState(req.params.folderId, data);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.get('/threads/:threadId/state', async (req, res) => {
	try {
		const data = await persistence.getThreadState(req.params.threadId);
		res.json({ ok: true, data, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/threads/:threadId/state', async (req, res) => {
	try {
		const { data } = req.body as { data: Record<string, unknown> };
		await persistence.updateThreadState(req.params.threadId, data);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.get('/messages/:messageId/state', async (req, res) => {
	try {
		const data = await persistence.getMessageState(req.params.messageId);
		res.json({ ok: true, data, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/messages/:messageId/state', async (req, res) => {
	try {
		const { data } = req.body as { data: Record<string, unknown> };
		await persistence.updateMessageState(req.params.messageId, data);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.get('/threads/:threadId/message-states', async (req, res) => {
	try {
		const states = await persistence.getMessageStatesByThreadId(req.params.threadId);
		res.json({ ok: true, data: states, error: null });
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
		sseManager.emit('chatPresets:update', preset);
		res.json({ ok: true, data: preset, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.put('/presets/:id', (req, res) => {
	try {
		const preset = updateChatPreset(req.params.id, req.body as Partial<IChatPresetCreatePayload>);
		if (!preset) return res.status(404).json({ ok: false, data: null, error: 'Not found' });
		sseManager.emit('chatPresets:update', preset);
		res.json({ ok: true, data: preset, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

chatRouter.delete('/presets/:id', (req, res) => {
	try {
		const ok = deleteChatPreset(req.params.id);
		if (!ok) return res.status(404).json({ ok: false, data: null, error: 'Not found' });
		sseManager.emit('chatPresets:delete', { id: req.params.id });
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
		await embeddingManager.deleteEmbeddingForMessage(messageId, threadId);
		await persistence.deleteMessage(messageId);
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