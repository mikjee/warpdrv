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
	IChatThread,
	IListThreadsOptions,
	IThreadConfig,
	IChatMessage,
	IMessagePart,
	IToolCall,
	IServerPermission,
	IToolPermission,
	TFolderId,
	TThreadId,
	TMessageId,
	TToolCallId,
} from '../types';
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
	};
}

function buildSchema(t: ReturnType<typeof buildTableNames>): string {
	return `
		CREATE TABLE IF NOT EXISTS ${t.folders} (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
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
		CREATE INDEX IF NOT EXISTS idx_${t.threads}_folder ON ${t.threads}(folderId);
		CREATE INDEX IF NOT EXISTS idx_${t.threads}_updated ON ${t.threads}(updatedAt);
		CREATE INDEX IF NOT EXISTS idx_${t.messages}_thread ON ${t.messages}(threadId);
		CREATE INDEX IF NOT EXISTS idx_${t.messages}_parent ON ${t.messages}(parentId);
		CREATE INDEX IF NOT EXISTS idx_${t.messageParts}_message ON ${t.messageParts}(messageId, orderIndex);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_message ON ${t.toolCalls}(messageId);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_thread ON ${t.toolCalls}(threadId);
		CREATE INDEX IF NOT EXISTS idx_${t.toolCalls}_status ON ${t.toolCalls}(status);
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
	}

	// ============================================================
	// Folders
	// ============================================================
	async createFolder(folder: IFolder): Promise<void> {
		this.db!.prepare(
			`INSERT INTO ${this.t.folders} (id, name, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)`
		).run(folder.id, folder.name, folder.parentId, folder.sortOrder, folder.createdAt);
	}

	async getFolder(id: TFolderId): Promise<IFolder | null> {
		return this.db!.prepare(`SELECT * FROM ${this.t.folders} WHERE id = ?`).get(id) as IFolder | undefined ?? null;
	}

	async listFolders(): Promise<IFolder[]> {
		return this.db!.prepare(`SELECT * FROM ${this.t.folders} ORDER BY sortOrder ASC, createdAt ASC`).all() as IFolder[];
	}

	async updateFolder(id: TFolderId, updates: Partial<IFolder>): Promise<void> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name); }
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
}