// ============================================================
// warpbridge/src/persistence/betterSqlite.ts
// SQLite persistence using better-sqlite3. Node only.
// Schema mirrors WarpCore's chat.db. Table prefix configurable.
// ============================================================
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import type { IPersistence } from '../types/interfaces';
import type {
	IFolder,
	IReorderFolderEntry,
	IWorkspace,
	IChatThread,
	IListThreadsOptions,
	IThreadConfig,
	IChatMessage,
	IMessagePart,
	IToolCall,
	IToolAttachment,
	IServerPermission,
	IToolPermission,
	IThreadToolPermission,
	TFolderId,
	TThreadId,
	TMessageId,
	TToolCallId,
	ISearchOptions,
	ISearchResult,
	ISearchThreadResult,
} from '../types';
import { folderNameToTopic } from '../util/topic';
import {
	EChatRole,
	EMessagePartType,
	EToolApprovalMode,
	EToolCallStatus,
} from '../types';

export interface IBetterSqlitePersistenceOptions {
	// Prefix prepended to all table names. Default: '' (matches WarpCore).
	tablePrefix?: string;
}

// ============================================================
// Table name helpers
// ============================================================
function buildTableNames(prefix: string) {
	return {
		folders: `${prefix}folders`,
		threads: `${prefix}threads`,
		threadConfigs: `${prefix}thread_configs`,
		messages: `${prefix}messages`,
		messageParts: `${prefix}message_parts`,
		toolCalls: `${prefix}tool_calls`,
		serverPermissions: `${prefix}mcp_server_permissions`,
		toolPermissions: `${prefix}mcp_tool_permissions`,
		threadToolPermissions: `${prefix}thread_tool_permissions`,
		threadAttachedTools: `${prefix}thread_attached_tools`,
		embeddingIndex: `${prefix}embedding_index`,
		workspaces: `${prefix}workspaces`,
		threadFts: `${prefix}threads_fts`,
		messagePartsFts: `${prefix}message_parts_fts`,
	};
}

function buildSchema(t: ReturnType<typeof buildTableNames>): string {
	return `
		CREATE TABLE IF NOT EXISTS ${t.folders} (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			topic TEXT NOT NULL DEFAULT '' UNIQUE,
			parentId TEXT,
			sortOrder INTEGER NOT NULL DEFAULT 0,
			createdAt INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ${t.threads} (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL DEFAULT 'New Chat',
			folderId TEXT,
			systemPrompt TEXT NOT NULL DEFAULT '',
			meta TEXT NOT NULL DEFAULT '{}',
			totalPromptTokens INTEGER NOT NULL DEFAULT 0,
			totalCompletionTokens INTEGER NOT NULL DEFAULT 0,
			createdAt INTEGER NOT NULL,
			updatedAt INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ${t.threadConfigs} (
			threadId TEXT PRIMARY KEY,
			presetId TEXT,
			systemPrompt TEXT NOT NULL DEFAULT '',
			params TEXT NOT NULL DEFAULT '{}'
		);
		CREATE TABLE IF NOT EXISTS ${t.messages} (
			id TEXT PRIMARY KEY,
			parentId TEXT,
			threadId TEXT NOT NULL,
			role TEXT NOT NULL,
			stats TEXT,
			createdAt INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS ${t.messageParts} (
			id TEXT PRIMARY KEY,
			messageId TEXT NOT NULL,
			type TEXT NOT NULL,
			orderIndex INTEGER NOT NULL,
			text TEXT,
			toolCallId TEXT,
			data TEXT,
			mimeType TEXT,
			fileName TEXT,
			fileSize INTEGER,
			extractedText TEXT
		);
		CREATE TABLE IF NOT EXISTS ${t.toolCalls} (
			id TEXT PRIMARY KEY,
			messageId TEXT NOT NULL,
			threadId TEXT NOT NULL,
			serverName TEXT NOT NULL,
			toolName TEXT NOT NULL,
			arguments TEXT NOT NULL DEFAULT '{}',
			result TEXT,
			status TEXT NOT NULL DEFAULT 'PENDING',
			error TEXT,
			createdAt INTEGER NOT NULL,
			resolvedAt INTEGER
		);
		CREATE TABLE IF NOT EXISTS ${t.serverPermissions} (
			serverName TEXT PRIMARY KEY,
			enabled INTEGER NOT NULL DEFAULT 1
		);
		CREATE TABLE IF NOT EXISTS ${t.toolPermissions} (
			serverName TEXT NOT NULL,
			toolName TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			approvalMode TEXT NOT NULL DEFAULT 'ASK',
			PRIMARY KEY (serverName, toolName)
		);
		CREATE TABLE IF NOT EXISTS ${t.threadToolPermissions} (
			threadId TEXT NOT NULL,
			serverName TEXT NOT NULL,
			toolName TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			approvalMode TEXT NOT NULL DEFAULT 'ASK',
			PRIMARY KEY (threadId, serverName, toolName)
		);
		CREATE TABLE IF NOT EXISTS ${t.threadAttachedTools} (
			threadId TEXT PRIMARY KEY,
			attachAllTools INTEGER NOT NULL DEFAULT 1,
			tools TEXT NOT NULL DEFAULT '[]'
		);
		CREATE TABLE IF NOT EXISTS ${t.embeddingIndex} (
			messageId TEXT NOT NULL,
			threadId TEXT NOT NULL,
			modelId TEXT NOT NULL,
			topic TEXT NOT NULL,
			embeddedAt INTEGER NOT NULL,
			PRIMARY KEY (messageId, modelId, topic)
		);
		CREATE INDEX IF NOT EXISTS idx_${t.embeddingIndex}_thread ON ${t.embeddingIndex}(threadId, modelId, topic);
		CREATE INDEX IF NOT EXISTS idx_${t.threads}_folder ON ${t.threads}(folderId);
		CREATE INDEX IF NOT EXISTS idx_${t.threads}_updated ON ${t.threads}(updatedAt);
		CREATE INDEX IF NOT EXISTS idx_${t.messages}_thread ON ${t.messages}(threadId);
		CREATE INDEX IF NOT EXISTS idx_${t.messages}_parent ON ${t.messages}(parentId);
		CREATE INDEX IF NOT EXISTS idx_${t.messageParts}_message ON ${t.messageParts}(messageId, orderIndex);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_message ON ${t.toolCalls}(messageId);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_thread ON ${t.toolCalls}(threadId);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_status ON ${t.toolCalls}(status);
		CREATE TABLE IF NOT EXISTS ${t.workspaces} (
			folderId TEXT PRIMARY KEY REFERENCES folders(id),
			data TEXT NOT NULL DEFAULT '{}'
		);

		-- FTS5 — full-text search on thread titles and message content
		-- External-content mode: snippet() reads from backing table, no storage duplication
		-- NOTE: rowid stability assumed (better-sqlite3 does not auto-vacuum).
		-- If VACUUM is ever run manually, re-initialize to re-backfill FTS tables.
		CREATE VIRTUAL TABLE IF NOT EXISTS ${t.threadFts} USING fts5(
			title,
			tokenize = 'porter unicode61'
		);
		CREATE VIRTUAL TABLE IF NOT EXISTS ${t.messagePartsFts} USING fts5(
			text,
			tokenize = 'porter unicode61'
		);

		-- Triggers: threads_fts
		CREATE TRIGGER IF NOT EXISTS threads_ai AFTER INSERT ON ${t.threads} BEGIN
			INSERT INTO ${t.threadFts}(rowid, title) VALUES (new.rowid, new.title);
		END;
		CREATE TRIGGER IF NOT EXISTS threads_ad AFTER DELETE ON ${t.threads} BEGIN
			DELETE FROM ${t.threadFts} WHERE rowid = old.rowid;
		END;
		CREATE TRIGGER IF NOT EXISTS threads_au AFTER UPDATE ON ${t.threads} BEGIN
			DELETE FROM ${t.threadFts} WHERE rowid = old.rowid;
			INSERT INTO ${t.threadFts}(rowid, title) VALUES (new.rowid, new.title);
		END;

		-- Triggers: message_parts_fts
		-- Only index TEXT, REASONING, and ATTACHMENT.extractedText
		CREATE TRIGGER IF NOT EXISTS mp_ai AFTER INSERT ON ${t.messageParts}
		WHEN (new.type IN ('text','reasoning') AND new.text IS NOT NULL AND length(new.text) > 0)
		   OR (new.type = 'attachment' AND new.extractedText IS NOT NULL AND length(new.extractedText) > 0)
		BEGIN
			INSERT INTO ${t.messagePartsFts}(rowid, text)
			VALUES (new.rowid, CASE WHEN new.type = 'attachment' THEN new.extractedText ELSE new.text END);
		END;
		CREATE TRIGGER IF NOT EXISTS mp_ad AFTER DELETE ON ${t.messageParts} BEGIN
			DELETE FROM ${t.messagePartsFts} WHERE rowid = old.rowid;
		END;
		CREATE TRIGGER IF NOT EXISTS mp_au AFTER UPDATE ON ${t.messageParts}
		WHEN (old.type IN ('text','reasoning','attachment') OR new.type IN ('text','reasoning','attachment'))
		BEGIN
			DELETE FROM ${t.messagePartsFts} WHERE rowid = old.rowid;
			INSERT INTO ${t.messagePartsFts}(rowid, text)
			SELECT new.rowid, CASE WHEN new.type = 'attachment' THEN new.extractedText ELSE new.text END
			WHERE (new.type IN ('text','reasoning') AND new.text IS NOT NULL AND length(new.text) > 0)
			   OR (new.type = 'attachment' AND new.extractedText IS NOT NULL AND length(new.extractedText) > 0);
		END;
	`;
}

// ============================================================
// BetterSqlitePersistence
// ============================================================
export class SqlitePersistence implements IPersistence {
	private db: Database.Database | null = null;
	private dbPath: string;
	private t: ReturnType<typeof buildTableNames>;

	constructor(dbPath: string, options: IBetterSqlitePersistenceOptions = {}) {
		this.dbPath = dbPath;
		this.t = buildTableNames(options.tablePrefix ?? '');
	}

	async init(): Promise<void> {
		const dir = path.dirname(this.dbPath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

		this.db = new Database(this.dbPath, {
			nativeBinding: (process as any).pkg
				? path.join(process.env.WARPCORE_RESOURCE_DIR ?? path.dirname(process.execPath), 'binaries', 'better_sqlite3.node')
				: undefined
		});

		this.db.pragma('journal_mode = WAL');
		this.db.pragma('foreign_keys = ON');
		this.db.exec(buildSchema(this.t));
		this.runMigrations();
	}

	private runMigrations(): void {
		const columnSchema = [
			{ name: 'data', type: 'TEXT' },
			{ name: 'mimeType', type: 'TEXT' },
			{ name: 'fileName', type: 'TEXT' },
			{ name: 'fileSize', type: 'INTEGER' },
			{ name: 'extractedText', type: 'TEXT' },
		];
		for (const col of columnSchema) {
			try {
				this.db!.exec(`ALTER TABLE ${this.t.messageParts} ADD COLUMN ${col.name} ${col.type}`);
			} catch {
				// Column already exists (SQLite returns error on duplicate ADD COLUMN)
			}
		}

		// Add topic column to folders, populate from name
		try {
			this.db!.exec(`ALTER TABLE ${this.t.folders} ADD COLUMN topic TEXT NOT NULL DEFAULT ''`);
			const folders = this.db!.prepare(`SELECT id, name FROM ${this.t.folders}`).all() as Array<{ id: string; name: string }>;
			for (const f of folders) {
				this.db!.prepare(`UPDATE ${this.t.folders} SET topic = ? WHERE id = ?`).run(folderNameToTopic(f.name), f.id);
			}
			console.log(`[migration] Added topic to ${folders.length} folders`);
		} catch {
			// Column already exists
		}

		// FTS5 — standard mode, populate index via INSERT
		try {
			const txn = this.db!.transaction(() => {
				this.db!.prepare(
					`INSERT INTO ${this.t.threadFts}(rowid, title) SELECT rowid, title FROM ${this.t.threads}`
				).run();
				this.db!.prepare(
					`INSERT INTO ${this.t.messagePartsFts}(rowid, text)
					 SELECT rowid, CASE WHEN type IN ('text','reasoning') THEN text ELSE extractedText END
					 FROM ${this.t.messageParts}
					 WHERE (type IN ('text','reasoning') AND text IS NOT NULL AND length(text) > 0)
					    OR (type = 'attachment' AND extractedText IS NOT NULL AND length(extractedText) > 0)`
				).run();
			});
			txn();

			const mpCount = this.db!.prepare(`SELECT count(*) as c FROM ${this.t.messagePartsFts}`).get() as { c: number };
			const thCount = this.db!.prepare(`SELECT count(*) as c FROM ${this.t.threadFts}`).get() as { c: number };
			console.log(`[FTS5] Indexed ${mpCount.c} message parts, ${thCount.c} threads`);
		} catch (err) {
			console.error('[FTS5] Index build failed:', err);
		}
	}

	// ============================================================
	// Folders
	// ============================================================
	async createFolder(folder: IFolder): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.folders} (id, name, topic, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
		).run(folder.id, folder.name, folder.topic, folder.parentId, folder.sortOrder, folder.createdAt);
	}

	async getFolder(id: TFolderId): Promise<IFolder | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.folders} WHERE id = ?`).get(id) as IFolder | undefined ?? null;
	}

	async listFolders(): Promise<IFolder[]> {
		return this.db!.prepare(`SELECT * FROM ${this.t.folders} ORDER BY sortOrder ASC, createdAt ASC`).all() as IFolder[];
	}

	async getFolderByTopic(topic: string): Promise<IFolder | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.folders} WHERE topic = ?`).get(topic) as IFolder | undefined ?? null;
	}

	async isTopicUnique(topic: string, excludeFolderId?: TFolderId): Promise<boolean> {
		if (topic === 'global') return false;
		const existing = await this.getFolderByTopic(topic);
		if (!existing) return true;
		return existing.id !== excludeFolderId;
	}

	async updateFolder(id: TFolderId, updates: Partial<IFolder>): Promise<void> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
		if (updates.topic !== undefined) { sets.push('topic = ?'); vals.push(updates.topic); }
		if (updates.parentId !== undefined) { sets.push('parentId = ?'); vals.push(updates.parentId); }
		if (updates.sortOrder !== undefined) { sets.push('sortOrder = ?'); vals.push(updates.sortOrder); }
		if (sets.length === 0) return;
		vals.push(id);
		this.db!.prepare(`UPDATE ${this.t.folders} SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
	}

	async deleteFolder(id: TFolderId): Promise<void> {
		this.db!.prepare(`DELETE FROM ${this.t.folders} WHERE id = ?`).run(id);
	}

	async reorderFolders(entries: IReorderFolderEntry[]): Promise<void> {
		const stmt = this.db!.prepare(`UPDATE ${this.t.folders} SET sortOrder = ? WHERE id = ?`);
		const txn = this.db!.transaction((items: IReorderFolderEntry[]) => {
			for (const entry of items) {
				stmt.run(entry.sortOrder, entry.id);
			}
		});
		txn(entries);
	}

	// ============================================================
	// Workspaces
	// ============================================================
	async createWorkspace(workspace: IWorkspace): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.workspaces} (folderId, data) VALUES (?, ?)`
		).run(workspace.folderId, JSON.stringify(workspace.data));
	}

	async getWorkspace(folderId: TFolderId): Promise<IWorkspace | null> {
		const row = this.db!.prepare(`SELECT * FROM ${this.t.workspaces} WHERE folderId = ?`).get(folderId) as { folderId: string; data: string } | undefined;
		if (!row) return null;
		return { folderId: row.folderId, data: JSON.parse(row.data) };
	}

	async updateWorkspace(folderId: TFolderId, data: Record<string, unknown>): Promise<void> {
		const existing = await this.getWorkspace(folderId);
		if (existing) {
			// Additive merge — new fields overlay onto existing data
			this.db!.prepare(`UPDATE ${this.t.workspaces} SET data = ? WHERE folderId = ?`).run(JSON.stringify({ ...existing.data, ...data }), folderId);
		} else {
			await this.createWorkspace({ folderId, data });
		}
	}

	async deleteWorkspace(folderId: TFolderId): Promise<void> {
		this.db!.prepare(`DELETE FROM ${this.t.workspaces} WHERE folderId = ?`).run(folderId);
	}

	// ============================================================
	// Threads
	// ============================================================
	async createThread(thread: IChatThread): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.threads} (id, title, folderId, systemPrompt, meta, totalPromptTokens, totalCompletionTokens, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(thread.id, thread.title, thread.folderId, thread.systemPrompt, thread.meta, thread.totalPromptTokens, thread.totalCompletionTokens, thread.createdAt, thread.updatedAt);
	}

	async getThread(id: TThreadId): Promise<IChatThread | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.threads} WHERE id = ?`).get(id) as IChatThread | undefined ?? null;
	}

	async listThreads(options?: IListThreadsOptions): Promise<IChatThread[]> {
		const conditions: string[] = [];
		const vals: unknown[] = [];

		if (options?.folderId !== undefined) {
			if (options.folderId === null) {
				conditions.push('folderId IS NULL');
			} else {
				conditions.push('folderId = ?');
				vals.push(options.folderId);
			}
		}
		if (options?.query) {
			conditions.push('title LIKE ?');
			vals.push(`%${options.query}%`);
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
		const threads = this.db!.prepare(`SELECT * FROM ${this.t.threads} ${where} ORDER BY updatedAt DESC`).all(...vals) as IChatThread[];
		return threads;
	}

	async updateThread(id: TThreadId, updates: Partial<IChatThread>): Promise<void> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title); }
		if (updates.folderId !== undefined) { sets.push('folderId = ?'); vals.push(updates.folderId); }
		if (updates.systemPrompt !== undefined) { sets.push('systemPrompt = ?'); vals.push(updates.systemPrompt); }
		if (updates.meta !== undefined) { sets.push('meta = ?'); vals.push(updates.meta); }
		sets.push('updatedAt = ?'); vals.push(Date.now());
		vals.push(id);
		this.db!.prepare(`UPDATE ${this.t.threads} SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
	}

	async deleteThread(id: TThreadId): Promise<void> {
		this.db!.prepare(`DELETE FROM ${this.t.threads} WHERE id = ?`).run(id);
	}

	async deleteThreadCascade(id: TThreadId): Promise<Array<{ messageId: string; modelId: string; topic: string }>> {
		return this.db!.transaction(() => {
			// 1. Get all embeddings before deleting
			const embeddings = this.db!.prepare(
				`SELECT messageId, modelId, topic FROM ${this.t.embeddingIndex} WHERE threadId = ?`
			).all(id) as Array<{ messageId: string; modelId: string; topic: string }>;

			// 2. Delete embedding index entries
			this.db!.prepare(`DELETE FROM ${this.t.embeddingIndex} WHERE threadId = ?`).run(id);

			// 3. Get all messageIds
			const messageIds = this.db!.prepare(
				`SELECT id FROM ${this.t.messages} WHERE threadId = ?`
			).all(id) as Array<{ id: string }>;
			const ids = messageIds.map(m => m.id);

			// 4. Delete message parts
			if (ids.length) {
				const placeholders = ids.map(() => '?').join(',');
				this.db!.prepare(`DELETE FROM ${this.t.messageParts} WHERE messageId IN (${placeholders})`).run(...ids);
			}

			// 5. Delete tool calls
			this.db!.prepare(`DELETE FROM ${this.t.toolCalls} WHERE threadId = ?`).run(id);

			// 6. Delete messages
			this.db!.prepare(`DELETE FROM ${this.t.messages} WHERE threadId = ?`).run(id);

			// 7. Delete thread configs
			this.db!.prepare(`DELETE FROM ${this.t.threadConfigs} WHERE threadId = ?`).run(id);

			// 8. Delete thread tool permissions
			this.db!.prepare(`DELETE FROM ${this.t.threadToolPermissions} WHERE threadId = ?`).run(id);

			// 9. Delete thread attached tools
			this.db!.prepare(`DELETE FROM ${this.t.threadAttachedTools} WHERE threadId = ?`).run(id);

			// 10. Delete thread
			this.db!.prepare(`DELETE FROM ${this.t.threads} WHERE id = ?`).run(id);

			return embeddings;
		})();
	}

	async incrementThreadTokens(id: TThreadId, promptDelta: number = 0, completionDelta: number = 0): Promise<void> {
		this.db!.prepare(
			`UPDATE ${this.t.threads} SET totalPromptTokens = totalPromptTokens + ?, totalCompletionTokens = totalCompletionTokens + ?, updatedAt = ? WHERE id = ?`
		).run(promptDelta, completionDelta, Date.now(), id);
	}

	// ============================================================
	// Thread Configs
	// ============================================================
	async getThreadConfig(threadId: TThreadId): Promise<IThreadConfig | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.threadConfigs} WHERE threadId = ?`).get(threadId) as IThreadConfig | undefined ?? null;
	}

	async setThreadConfig(config: IThreadConfig): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.threadConfigs} (threadId, presetId, systemPrompt, params) VALUES (?, ?, ?, ?)
			 ON CONFLICT(threadId) DO UPDATE SET presetId = excluded.presetId, systemPrompt = excluded.systemPrompt, params = excluded.params`
		).run(config.threadId, config.presetId, config.systemPrompt, config.params);
	}

	async deleteThreadConfig(threadId: TThreadId): Promise<void> {
		this.db!.prepare(`DELETE FROM ${this.t.threadConfigs} WHERE threadId = ?`).run(threadId);
	}

	// ============================================================
	// Messages (with parts)
	// ============================================================
	async createMessage(message: IChatMessage): Promise<void> {
		const stats = message.stats ? JSON.stringify(message.stats) : null;
		const txn = this.db!.transaction(() => {
			this.db!.prepare(
				`INSERT INTO ${this.t.messages} (id, parentId, threadId, role, stats, createdAt) VALUES (?, ?, ?, ?, ?, ?)`
			).run(message.id, message.parentId ?? null, message.threadId, message.role, stats, message.createdAt);
			for (const part of message.content) {
				this.insertPart(message.id, part);
			}
		});
		txn();
	}

	async appendMessagePart(messageId: TMessageId, part: IMessagePart): Promise<void> {
		this.insertPart(messageId, part);
	}

	async replaceMessageParts(messageId: TMessageId, parts: IMessagePart[]): Promise<void> {
		const txn = this.db!.transaction(() => {
			this.db!.prepare(`DELETE FROM ${this.t.messageParts} WHERE messageId = ?`).run(messageId);
			for (const part of parts) {
				this.insertPart(messageId, part);
			}
		});
		txn();
	}

	async deleteMessage(id: TMessageId): Promise<void> {
		const msg = this.db!.prepare(`SELECT parentId FROM ${this.t.messages} WHERE id = ?`).get(id) as { parentId?: string | null } | undefined;
		if (!msg) return;
		
		if (!msg.parentId) {
			throw new Error('Cannot delete root message');
		}
		
		this.db!.transaction((() => {
			this.db!.prepare(`UPDATE ${this.t.messages} SET parentId = ? WHERE parentId = ?`).run(msg.parentId, id);
			this.db!.prepare(`DELETE FROM ${this.t.messages} WHERE id = ?`).run(id);
		}) as any)();
	}

	async getMessages(threadId: TThreadId): Promise<IChatMessage[]> {
		const rows = this.db!.prepare(
			`SELECT * FROM ${this.t.messages} WHERE threadId = ? ORDER BY createdAt ASC`
		).all(threadId) as Array<Record<string, unknown>>;
		return rows.map(r => this.hydrateMessage(r));
	}

	async getMessage(id: TMessageId): Promise<IChatMessage | null> {
		const row = this.db!.prepare(`SELECT * FROM ${this.t.messages} WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
		if (!row) return null;
		return this.hydrateMessage(row);
	}

	async updateMessage(id: TMessageId, updates: Partial<Pick<IChatMessage, 'stats'>>): Promise<void> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		if (updates.stats !== undefined) {
			sets.push('stats = ?');
			vals.push(updates.stats ? JSON.stringify(updates.stats) : null);
		}
		if (sets.length === 0) return;
		vals.push(id);
		this.db!.prepare(`UPDATE ${this.t.messages} SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
	}

	private insertPart(messageId: TMessageId, part: IMessagePart): void {
		const text = part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING
			? part.text
			: null;
		const toolCallId = part.type === EMessagePartType.TOOL_CALL ? part.toolCallId : null;
		const data = part.type === EMessagePartType.ATTACHMENT ? part.data : null;
		const mimeType = part.type === EMessagePartType.ATTACHMENT ? part.mimeType : null;
		const fileName = part.type === EMessagePartType.ATTACHMENT ? part.fileName : null;
		const fileSize = part.type === EMessagePartType.ATTACHMENT ? part.fileSize : null;
		const extractedText = part.type === EMessagePartType.ATTACHMENT ? (part.extractedText ?? null) : null;
		this.db!.prepare(
			`INSERT INTO ${this.t.messageParts} (id, messageId, type, orderIndex, text, toolCallId, data, mimeType, fileName, fileSize, extractedText) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(part.id, messageId, part.type, part.orderIndex, text, toolCallId, data, mimeType, fileName, fileSize, extractedText);
	}

	private hydrateMessage(row: Record<string, unknown>): IChatMessage {
		const partRows = this.db!.prepare(
			`SELECT * FROM ${this.t.messageParts} WHERE messageId = ? ORDER BY orderIndex ASC`
		).all(row.id as string) as Array<Record<string, unknown>>;

		const content: IMessagePart[] = partRows.map(p => {
			if (p.type === EMessagePartType.TEXT) {
				return { id: p.id as string, type: EMessagePartType.TEXT, orderIndex: p.orderIndex as number, text: (p.text as string) ?? '' };
			}
			if (p.type === EMessagePartType.REASONING) {
				return { id: p.id as string, type: EMessagePartType.REASONING, orderIndex: p.orderIndex as number, text: (p.text as string) ?? '' };
			}
			if (p.type === EMessagePartType.ATTACHMENT) {
				return {
					id: p.id as string, type: EMessagePartType.ATTACHMENT, orderIndex: p.orderIndex as number,
					data: (p.data as string) ?? '',
					mimeType: (p.mimeType as string) ?? '',
					fileName: (p.fileName as string) ?? '',
					fileSize: (p.fileSize as number) ?? 0,
					extractedText: (p.extractedText as string) ?? undefined,
				};
			} 
			return { id: p.id as string, type: EMessagePartType.TOOL_CALL, orderIndex: p.orderIndex as number, toolCallId: p.toolCallId as string };
		});

		const statsRaw = row.stats as string | null;
		return {
			id: row.id as string,
			parentId: (row.parentId as string) ?? null,
			threadId: row.threadId as string,
			role: row.role as EChatRole,
			content,
			stats: statsRaw ? JSON.parse(statsRaw) : null,
			createdAt: row.createdAt as number,
		};
	}

	// ============================================================
	// Tool Calls
	// ============================================================
	async createToolCall(toolCall: IToolCall): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.toolCalls} (id, messageId, threadId, serverName, toolName, arguments, result, status, error, createdAt, resolvedAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(toolCall.id, toolCall.messageId, toolCall.threadId, toolCall.serverName, toolCall.toolName,
			toolCall.arguments, toolCall.result, toolCall.status, toolCall.error, toolCall.createdAt, toolCall.resolvedAt);
	}

	async updateToolCall(id: TToolCallId, updates: Partial<IToolCall>): Promise<void> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status); }
		if (updates.result !== undefined) { sets.push('result = ?'); vals.push(updates.result); }
		if (updates.error !== undefined) { sets.push('error = ?'); vals.push(updates.error); }
		if (updates.resolvedAt !== undefined) { sets.push('resolvedAt = ?'); vals.push(updates.resolvedAt); }
		if (sets.length === 0) return;
		vals.push(id);
		this.db!.prepare(`UPDATE ${this.t.toolCalls} SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
	}

	async getToolCall(id: TToolCallId): Promise<IToolCall | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.toolCalls} WHERE id = ?`).get(id) as IToolCall | undefined ?? null;
	}

	async getToolCallsForThread(threadId: TThreadId): Promise<IToolCall[]> {
		return this.db!.prepare(
			`SELECT * FROM ${this.t.toolCalls} WHERE threadId = ? ORDER BY createdAt ASC`
		).all(threadId) as IToolCall[];
	}

	async getToolCallsForMessage(messageId: TMessageId): Promise<IToolCall[]> {
		return this.db!.prepare(
			`SELECT * FROM ${this.t.toolCalls} WHERE messageId = ? ORDER BY createdAt ASC`
		).all(messageId) as IToolCall[];
	}

	async getPendingToolCalls(): Promise<IToolCall[]> {
		return this.db!.prepare(
			`SELECT * FROM ${this.t.toolCalls} WHERE status = ? ORDER BY createdAt ASC`
		).all(EToolCallStatus.PENDING) as IToolCall[];
	}

	// ============================================================
	// Permissions — servers
	// ============================================================
	async getServerPermission(serverName: string): Promise<IServerPermission | null> {
		const row = this.db!.prepare(
			`SELECT * FROM ${this.t.serverPermissions} WHERE serverName = ?`
		).get(serverName) as { serverName: string; enabled: number } | undefined;
		if (!row) return null;
		return { serverName: row.serverName, enabled: row.enabled === 1 };
	}

	async setServerPermission(serverName: string, enabled: boolean): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.serverPermissions} (serverName, enabled) VALUES (?, ?)
			 ON CONFLICT(serverName) DO UPDATE SET enabled = excluded.enabled`
		).run(serverName, enabled ? 1 : 0);
	}

	async getAllServerPermissions(): Promise<IServerPermission[]> {
		const rows = this.db!.prepare(`SELECT * FROM ${this.t.serverPermissions}`).all() as Array<{ serverName: string; enabled: number }>;
		return rows.map(r => ({ serverName: r.serverName, enabled: r.enabled === 1 }));
	}

	// ============================================================
	// Permissions — tools
	// ============================================================
	async getToolPermission(serverName: string, toolName: string): Promise<IToolPermission | null> {
		const row = this.db!.prepare(
			`SELECT * FROM ${this.t.toolPermissions} WHERE serverName = ? AND toolName = ?`
		).get(serverName, toolName) as { serverName: string; toolName: string; enabled: number; approvalMode: string } | undefined;
		if (!row) return null;
		return {
			serverName: row.serverName,
			toolName: row.toolName,
			enabled: row.enabled === 1,
			approvalMode: row.approvalMode as EToolApprovalMode,
		};
	}

	async setToolPermission(serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.toolPermissions} (serverName, toolName, enabled, approvalMode) VALUES (?, ?, ?, ?)
			 ON CONFLICT(serverName, toolName) DO UPDATE SET enabled = excluded.enabled, approvalMode = excluded.approvalMode`
		).run(serverName, toolName, enabled ? 1 : 0, approvalMode);
	}

	async getAllToolPermissions(): Promise<IToolPermission[]> {
		const rows = this.db!.prepare(`SELECT * FROM ${this.t.toolPermissions}`).all() as Array<{ serverName: string; toolName: string; enabled: number; approvalMode: string }>;
		return rows.map(r => ({
			serverName: r.serverName,
			toolName: r.toolName,
			enabled: r.enabled === 1,
			approvalMode: r.approvalMode as EToolApprovalMode,
		}));
	}

	// ============================================================
	// Permissions — thread-level tool overrides
	// ============================================================
	async getThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string): Promise<IThreadToolPermission | null> {
		const row = this.db!.prepare(
			`SELECT * FROM ${this.t.threadToolPermissions} WHERE threadId = ? AND serverName = ? AND toolName = ?`
		).get(threadId, serverName, toolName) as { threadId: string; serverName: string; toolName: string; enabled: number; approvalMode: string } | undefined;
		if (!row) return null;
		return {
			threadId: row.threadId,
			serverName: row.serverName,
			toolName: row.toolName,
			enabled: row.enabled === 1,
			approvalMode: row.approvalMode as EToolApprovalMode,
		};
	}

	async setThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.threadToolPermissions} (threadId, serverName, toolName, enabled, approvalMode) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(threadId, serverName, toolName) DO UPDATE SET enabled = excluded.enabled, approvalMode = excluded.approvalMode`
		).run(threadId, serverName, toolName, enabled ? 1 : 0, approvalMode);
	}

	async deleteThreadToolPermission(threadId: TThreadId, serverName: string, toolName: string): Promise<void> {
		this.db!.prepare(
			`DELETE FROM ${this.t.threadToolPermissions} WHERE threadId = ? AND serverName = ? AND toolName = ?`
		).run(threadId, serverName, toolName);
	}

	async getAllThreadToolPermissions(threadId: TThreadId): Promise<IThreadToolPermission[]> {
		const rows = this.db!.prepare(
			`SELECT * FROM ${this.t.threadToolPermissions} WHERE threadId = ?`
		).all(threadId) as Array<{ threadId: string; serverName: string; toolName: string; enabled: number; approvalMode: string }>;
		return rows.map(r => ({
			threadId: r.threadId,
			serverName: r.serverName,
			toolName: r.toolName,
			enabled: r.enabled === 1,
			approvalMode: r.approvalMode as EToolApprovalMode,
		}));
	}

	// ============================================================
	// Thread Attached Tools
	// ============================================================
	async saveThreadAttachedTools(threadId: TThreadId, attachAllTools: boolean, tools: IToolAttachment[]): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.threadAttachedTools} (threadId, attachAllTools, tools) VALUES (?, ?, ?)
			 ON CONFLICT(threadId) DO UPDATE SET attachAllTools = excluded.attachAllTools, tools = excluded.tools`
		).run(threadId, attachAllTools ? 1 : 0, JSON.stringify(tools));
	}

	async getThreadAttachedTools(threadId: TThreadId): Promise<{ attachAllTools: boolean; tools: IToolAttachment[] } | null> {
		const row = this.db!.prepare(
			`SELECT * FROM ${this.t.threadAttachedTools} WHERE threadId = ?`
		).get(threadId) as { threadId: string; attachAllTools: number; tools: string } | undefined;
		if (!row) return null;
		return {
			attachAllTools: row.attachAllTools === 1,
			tools: JSON.parse(row.tools) as IToolAttachment[],
		};
	}

	// ============================================================
	// FTS Search
	// ============================================================

	private preprocessQuery(q: string): string {
		// Strip FTS5 special chars, split whitespace, append * for prefix matching
		const stripped = q.replace(/[\"\(\)\:\^\-\*]/g, ' ');
		return stripped
			.split(/\s+/)
			.map(t => t.trim().toLowerCase())
			.filter(t => t.length > 0)
			.map(t => t + '*')
			.join(' ');
	}

	async searchMessages(q: string, options: ISearchOptions): Promise<ISearchResult[]> {
		const processed = this.preprocessQuery(q);
		if (!processed) return [];
		console.log(`[FTS5] searchMessages: mode=${options.mode}, query="${q}" -> processed="${processed}"`);

		const limit = Math.min(options.limit ?? 50, 200);
		const offset = options.offset ?? 0;

		if (options.mode === 'thread') {
			if (!options.threadId) return [];
			const rows = this.db!.prepare(
				`SELECT m.id as messageId, m.threadId, thr.title as threadTitle,
				       snippet(${this.t.messagePartsFts}, 0, '<mark>', '</mark>', '...', 64) as snippet,
				       m.role, m.createdAt
				 FROM ${this.t.messagePartsFts}
				 JOIN ${this.t.messageParts} mp ON mp.rowid = ${this.t.messagePartsFts}.rowid
				 JOIN ${this.t.messages} m ON m.id = mp.messageId
				 JOIN ${this.t.threads} thr ON thr.id = m.threadId
				 WHERE ${this.t.messagePartsFts} MATCH ? AND m.threadId = ?
				 ORDER BY bm25(${this.t.messagePartsFts}), m.createdAt DESC
				 LIMIT ? OFFSET ?`
			).all(processed, options.threadId, limit, offset) as Array<Record<string, unknown>>;
			console.log(`[FTS5] thread mode: ${rows.length} results`);
			return rows.map(r => ({
				type: 'message' as const,
				threadId: r.threadId as string,
				threadTitle: r.threadTitle as string,
				messageId: r.messageId as string,
				snippet: r.snippet as string,
				role: r.role as string,
				createdAt: r.createdAt as number,
			}));
		}

		if (options.mode === 'everywhere') {
			const halfLimit = Math.ceil(limit / 2);

			// Thread branch
			const threadRows = this.db!.prepare(
				`SELECT t.id as threadId, t.title as threadTitle, t.updatedAt as createdAt
				 FROM ${this.t.threadFts}
				 JOIN ${this.t.threads} t ON t.rowid = ${this.t.threadFts}.rowid
				 WHERE ${this.t.threadFts} MATCH ?
				 ORDER BY bm25(${this.t.threadFts}), t.updatedAt DESC
				 LIMIT ?`
			).all(processed, halfLimit) as Array<Record<string, unknown>>;
			console.log(`[FTS5] everywhere: ${threadRows.length} thread results`);

			// Message branch
			const msgRows = this.db!.prepare(
				`SELECT m.id as messageId, m.threadId, thr.title as threadTitle,
				       snippet(${this.t.messagePartsFts}, 0, '<mark>', '</mark>', '...', 64) as snippet,
				       m.role, m.createdAt
				 FROM ${this.t.messagePartsFts}
				 JOIN ${this.t.messageParts} mp ON mp.rowid = ${this.t.messagePartsFts}.rowid
				 JOIN ${this.t.messages} m ON m.id = mp.messageId
				 JOIN ${this.t.threads} thr ON thr.id = m.threadId
				 WHERE ${this.t.messagePartsFts} MATCH ?
				 ORDER BY bm25(${this.t.messagePartsFts}), m.createdAt DESC
				 LIMIT ?`
			).all(processed, halfLimit) as Array<Record<string, unknown>>;
			console.log(`[FTS5] everywhere: ${msgRows.length} message results`);

			const results: ISearchResult[] = [];

			results.push(...threadRows.map(r => ({
				type: 'thread' as const,
				threadId: r.threadId as string,
				threadTitle: r.threadTitle as string,
				createdAt: r.createdAt as number,
			})));

			results.push(...msgRows.map(r => ({
				type: 'message' as const,
				threadId: r.threadId as string,
				threadTitle: r.threadTitle as string,
				messageId: r.messageId as string,
				snippet: r.snippet as string,
				role: r.role as string,
				createdAt: r.createdAt as number,
			})));

			return results;
		}

		// Default: return empty (shouldn't reach here with valid enum)
		return [];
	}

	async searchThreads(q: string, options?: { limit?: number; offset?: number }): Promise<ISearchThreadResult[]> {
		const processed = this.preprocessQuery(q);
		if (!processed) return [];

		const limit = Math.min(options?.limit ?? 50, 200);
		const offset = options?.offset ?? 0;

		const rows = this.db!.prepare(
			`SELECT m.threadId, thr.title as threadTitle, COUNT(DISTINCT m.id) as matchCount, MAX(m.createdAt) as lastMatchAt, 0 as sortPriority
			 FROM ${this.t.messagePartsFts}
			 JOIN ${this.t.messageParts} mp ON mp.rowid = ${this.t.messagePartsFts}.rowid
			 JOIN ${this.t.messages} m ON m.id = mp.messageId
			 JOIN ${this.t.threads} thr ON thr.id = m.threadId
			 WHERE ${this.t.messagePartsFts} MATCH ?
			 GROUP BY m.threadId

			 UNION ALL

			 SELECT t.id, t.title, 0 as matchCount, t.updatedAt as lastMatchAt, 1 as sortPriority
			 FROM ${this.t.threadFts}
			 JOIN ${this.t.threads} t ON t.rowid = ${this.t.threadFts}.rowid
			 WHERE ${this.t.threadFts} MATCH ?
			   AND NOT EXISTS (
				 SELECT 1 FROM ${this.t.messagePartsFts}
				 JOIN ${this.t.messageParts} mp2 ON mp2.rowid = ${this.t.messagePartsFts}.rowid
				 JOIN ${this.t.messages} m2 ON m2.id = mp2.messageId AND m2.threadId = t.id
				 WHERE ${this.t.messagePartsFts} MATCH ?
			 )

			 ORDER BY sortPriority DESC, matchCount DESC, lastMatchAt DESC
			 LIMIT ? OFFSET ?`
		).all(processed, processed, processed, limit, offset) as Array<Record<string, unknown>>;

		return rows.map(r => ({
			threadId: r.threadId as string,
			threadTitle: r.threadTitle as string,
			matchCount: Number(r.matchCount),
			lastMatchAt: r.lastMatchAt as number,
		}));
	}

	// ============================================================
	// Embedding Index
	// ============================================================
	async insertEmbeddingStatus(messageId: string, threadId: string, modelId: string, topic: string): Promise<void> {
		this.db!.prepare(
			`INSERT OR IGNORE INTO ${this.t.embeddingIndex} (messageId, threadId, modelId, topic, embeddedAt)
			 VALUES (?, ?, ?, ?, ?)`
		).run(messageId, threadId, modelId, topic, Date.now());
	}

	async getThreadEmbeddingStatuses(threadId: TThreadId, modelId: string, topic: string): Promise<Set<string>> {
		const rows = this.db!.prepare(
			`SELECT messageId FROM ${this.t.embeddingIndex} WHERE threadId = ? AND modelId = ? AND topic = ?`
		).all(threadId, modelId, topic) as Array<{ messageId: string }>;
		return new Set(rows.map(r => r.messageId));
	}

	async deleteEmbeddingStatus(messageId: string, modelId: string, topic: string): Promise<void> {
		this.db!.prepare(
			`DELETE FROM ${this.t.embeddingIndex} WHERE messageId = ? AND modelId = ? AND topic = ?`
		).run(messageId, modelId, topic);
	}

	async getMessageIdsByThreadId(threadId: TThreadId): Promise<string[]> {
		const rows = this.db!.prepare(
			`SELECT id FROM ${this.t.messages} WHERE threadId = ?`
		).all(threadId) as Array<{ id: string }>;
		return rows.map(r => r.id);
	}
}