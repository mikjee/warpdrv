import { Router } from 'express';
import crypto from 'crypto';
import { chatDb } from '../util/chatDB';
import type {
	IChatThread,
	IChatMessage,
	IChatFolder,
	IChatThreadCreatePayload,
	IChatMessageCreatePayload,
} from '@warpcore/shared';

export const chatRouter = Router();

// ============================================================
// Threads
// ============================================================

// Raw row from SQLite — tags is a JSON string
interface IThreadRow {
	id: string;
	title: string;
	folderId: string | null;
	serverId: string | null;
	systemPrompt: string;
	tags: string;
	createdAt: number;
	updatedAt: number;
}

function rowToThread(row: IThreadRow): IChatThread {
	return {
		...row,
		tags: JSON.parse(row.tags || '[]'),
	};
}

// GET /api/chat/threads — list all threads (metadata only, no messages)
chatRouter.get('/threads', async (_req, res) => {
	try {
		const rows = await chatDb.all<IThreadRow>(
			'SELECT * FROM threads ORDER BY updatedAt DESC'
		);
		const threads = rows.map(rowToThread);
		res.json({ ok: true, data: threads, total: threads.length, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: [], total: 0, error: String(err) });
	}
});

// POST /api/chat/threads — create a new thread
chatRouter.post('/threads', async (req, res) => {
	try {
		const body = req.body as IChatThreadCreatePayload;
		const now = Date.now();
		const id = crypto.randomUUID();
		const thread: IChatThread = {
			id,
			title: body.title ?? 'New Chat',
			folderId: body.folderId ?? null,
			serverId: body.serverId ?? null,
			systemPrompt: body.systemPrompt ?? '',
			tags: body.tags ?? [],
			createdAt: now,
			updatedAt: now,
		};
		await chatDb.run(
			`INSERT INTO threads (id, title, folderId, serverId, systemPrompt, tags, createdAt, updatedAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[thread.id, thread.title, thread.folderId, thread.serverId, thread.systemPrompt, JSON.stringify(thread.tags), thread.createdAt, thread.updatedAt]
		);
		res.json({ ok: true, data: thread, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// GET /api/chat/threads/:id — get thread with messages
chatRouter.get('/threads/:id', async (req, res) => {
	try {
		const row = await chatDb.get<IThreadRow>(
			'SELECT * FROM threads WHERE id = ?',
			[req.params.id]
		);
		if (!row) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		const messages = await chatDb.all<IChatMessage>(
			'SELECT * FROM messages WHERE threadId = ? ORDER BY createdAt ASC',
			[req.params.id]
		);
		const thread = rowToThread(row);
		res.json({ ok: true, data: { ...thread, messages }, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/chat/threads/:id — update thread metadata
chatRouter.put('/threads/:id', async (req, res) => {
	try {
		const row = await chatDb.get<IThreadRow>(
			'SELECT * FROM threads WHERE id = ?',
			[req.params.id]
		);
		if (!row) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		const body = req.body as Partial<IChatThreadCreatePayload>;
		const now = Date.now();
		const updated: IChatThread = {
			...rowToThread(row),
			title: body.title ?? row.title,
			folderId: body.folderId !== undefined ? body.folderId ?? null : row.folderId,
			serverId: body.serverId !== undefined ? body.serverId ?? null : row.serverId,
			systemPrompt: body.systemPrompt ?? row.systemPrompt,
			tags: body.tags ?? JSON.parse(row.tags || '[]'),
			updatedAt: now,
		};
		await chatDb.run(
			`UPDATE threads SET title = ?, folderId = ?, serverId = ?, systemPrompt = ?, tags = ?, updatedAt = ?
			 WHERE id = ?`,
			[updated.title, updated.folderId, updated.serverId, updated.systemPrompt, JSON.stringify(updated.tags), updated.updatedAt, req.params.id]
		);
		res.json({ ok: true, data: updated, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/chat/threads/:id — delete thread and its messages
chatRouter.delete('/threads/:id', async (req, res) => {
	try {
		// Messages cascade-delete via FK
		await chatDb.run('DELETE FROM threads WHERE id = ?', [req.params.id]);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Messages
// ============================================================

// POST /api/chat/threads/:id/messages — append one or more messages
chatRouter.post('/threads/:id/messages', async (req, res) => {
	try {
		const threadId = req.params.id;
		// Verify thread exists
		const thread = await chatDb.get<IThreadRow>(
			'SELECT id FROM threads WHERE id = ?',
			[threadId]
		);
		if (!thread) {
			res.status(404).json({ ok: false, data: null, error: 'Thread not found' });
			return;
		}
		// Accept single message or array
		const payloads: IChatMessageCreatePayload[] = Array.isArray(req.body)
			? req.body
			: [req.body];
		const now = Date.now();
		const messages: IChatMessage[] = payloads.map((p, i) => ({
			id: crypto.randomUUID(),
			threadId,
			role: p.role,
			content: p.content,
			createdAt: now + i, // preserve ordering within batch
		}));
		for (const msg of messages) {
			await chatDb.run(
				`INSERT INTO messages (id, threadId, role, content, createdAt)
				 VALUES (?, ?, ?, ?, ?)`,
				[msg.id, msg.threadId, msg.role, msg.content, msg.createdAt]
			);
		}
		// Touch thread updatedAt
		await chatDb.run(
			'UPDATE threads SET updatedAt = ? WHERE id = ?',
			[now, threadId]
		);
		res.json({ ok: true, data: messages, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// ============================================================
// Folders
// ============================================================

// GET /api/chat/folders
chatRouter.get('/folders', async (_req, res) => {
	try {
		const folders = await chatDb.all<IChatFolder>(
			'SELECT * FROM folders ORDER BY sortOrder ASC, createdAt ASC'
		);
		res.json({ ok: true, data: folders, total: folders.length, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: [], total: 0, error: String(err) });
	}
});

// POST /api/chat/folders
chatRouter.post('/folders', async (req, res) => {
	try {
		const { name, parentId, sortOrder } = req.body as { name: string; parentId?: string | null; sortOrder?: number };
		const now = Date.now();
		const id = crypto.randomUUID();
		const folder: IChatFolder = {
			id,
			name: name || 'New Folder',
			parentId: parentId ?? null,
			sortOrder: sortOrder ?? 0,
			createdAt: now,
		};
		await chatDb.run(
			`INSERT INTO folders (id, name, parentId, sortOrder, createdAt)
			 VALUES (?, ?, ?, ?, ?)`,
			[folder.id, folder.name, folder.parentId, folder.sortOrder, folder.createdAt]
		);
		res.json({ ok: true, data: folder, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// PUT /api/chat/folders/:id
chatRouter.put('/folders/:id', async (req, res) => {
	try {
		const existing = await chatDb.get<IChatFolder>(
			'SELECT * FROM folders WHERE id = ?',
			[req.params.id]
		);
		if (!existing) {
			res.status(404).json({ ok: false, data: null, error: 'Folder not found' });
			return;
		}
		const { name, parentId, sortOrder } = req.body as Partial<IChatFolder>;
		const updated: IChatFolder = {
			...existing,
			name: name ?? existing.name,
			parentId: parentId !== undefined ? parentId : existing.parentId,
			sortOrder: sortOrder ?? existing.sortOrder,
		};
		await chatDb.run(
			'UPDATE folders SET name = ?, parentId = ?, sortOrder = ? WHERE id = ?',
			[updated.name, updated.parentId, updated.sortOrder, req.params.id]
		);
		res.json({ ok: true, data: updated, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});

// DELETE /api/chat/folders/:id — threads in this folder move to root
chatRouter.delete('/folders/:id', async (req, res) => {
	try {
		// Move threads to root
		await chatDb.run(
			'UPDATE threads SET folderId = NULL WHERE folderId = ?',
			[req.params.id]
		);
		// Move child folders to root
		await chatDb.run(
			'UPDATE folders SET parentId = NULL WHERE parentId = ?',
			[req.params.id]
		);
		await chatDb.run('DELETE FROM folders WHERE id = ?', [req.params.id]);
		res.json({ ok: true, data: null, error: null });
	} catch (err) {
		res.status(500).json({ ok: false, data: null, error: String(err) });
	}
});