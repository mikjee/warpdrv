import initSqlJs, { type Database } from 'sql.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

import type { IToolPermission, IServerPermission as IMcpServerPermission, IToolCall } from '@warpcore/bridge';
import { EToolApprovalMode, EToolCallStatus } from '@warpcore/bridge';

// Resolve data dir (same logic as store.ts)
function getDataDir(): string {
	const platform = os.platform();
	if (platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	return path.join(os.homedir(), '.config', 'warpcore');
}

const DB_PATH = path.join(getDataDir(), 'chat.db');

let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Debounced save to disk — sql.js is in-memory, we persist manually
function scheduleSave() {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		if (!db) return;
		const data = db.export();
		const buffer = Buffer.from(data);
		fs.writeFileSync(DB_PATH, buffer);
	}, 500);
}

function saveNow() {
	if (saveTimer) clearTimeout(saveTimer);
	if (!db) return;
	const data = db.export();
	const buffer = Buffer.from(data);
	fs.writeFileSync(DB_PATH, buffer);
}

// Async wrappers matching the old API
async function run(sql: string, params: unknown[] = []): Promise<void> {
	db!.run(sql, params as any[]);
	scheduleSave();
}

async function get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
	const stmt = db!.prepare(sql);
	stmt.bind(params as any[]);
	if (stmt.step()) {
		const row = stmt.getAsObject() as T;
		stmt.free();
		return row;
	}
	stmt.free();
	return null;
}

async function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
	const stmt = db!.prepare(sql);
	stmt.bind(params as any[]);
	const results: T[] = [];
	while (stmt.step()) {
		results.push(stmt.getAsObject() as T);
	}
	stmt.free();
	return results;
}

// Schema
const SCHEMA = `
	CREATE TABLE IF NOT EXISTS folders (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		parentId TEXT,
		sortOrder INTEGER NOT NULL DEFAULT 0,
		createdAt INTEGER NOT NULL,
		FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE SET NULL
	);

	CREATE TABLE IF NOT EXISTS threads (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL DEFAULT 'New Chat',
		folderId TEXT,
		serverId TEXT,
		systemPrompt TEXT NOT NULL DEFAULT '',
		tags TEXT NOT NULL DEFAULT '[]',
		createdAt INTEGER NOT NULL,
		updatedAt INTEGER NOT NULL,
		FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
	);

	CREATE TABLE IF NOT EXISTS messages (
		id TEXT PRIMARY KEY,
		threadId TEXT NOT NULL,
		role TEXT NOT NULL,
		content TEXT NOT NULL,
		stats TEXT,
		createdAt INTEGER NOT NULL,
		FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt);
	CREATE INDEX IF NOT EXISTS idx_threads_folder ON threads(folderId);
	CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updatedAt);
	CREATE TABLE IF NOT EXISTS thread_configs (
		threadId TEXT PRIMARY KEY,
		presetId TEXT,
		systemPrompt TEXT NOT NULL DEFAULT '',
		params TEXT NOT NULL DEFAULT '{}',
		FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
	);
`;

const MCP_SCHEMA = `
	CREATE TABLE IF NOT EXISTS mcp_server_permissions (
		serverName TEXT PRIMARY KEY,
		enabled INTEGER NOT NULL DEFAULT 1
	);

	CREATE TABLE IF NOT EXISTS mcp_tool_permissions (
		serverName TEXT NOT NULL,
		toolName TEXT NOT NULL,
		enabled INTEGER NOT NULL DEFAULT 1,
		approvalMode TEXT NOT NULL DEFAULT 'ASK',
		PRIMARY KEY (serverName, toolName)
	);

	CREATE TABLE IF NOT EXISTS tool_calls (
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
		resolvedAt INTEGER,
		FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_tool_calls_message ON tool_calls(messageId);
	CREATE INDEX IF NOT EXISTS idx_tool_calls_thread ON tool_calls(threadId);
	CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
`;

async function runMcpMigrations(): Promise<void> {
	// Create MCP tables if they don't exist
	db!.exec(MCP_SCHEMA);

	// Future migrations go here
}

export async function initChatDb(): Promise<void> {
	const isPkg = (process as any).pkg !== undefined;
	let SQL;
	if (isPkg) {
		const candidates = [
			path.join(path.dirname(process.execPath), 'sql-wasm.wasm'),
			path.join(path.dirname(process.execPath), '..', 'lib', 'WarpCore', 'binaries', 'sql-wasm.wasm'),
			path.join(path.dirname(process.execPath), 'binaries', 'sql-wasm.wasm'),
		];
		let wasmBinary: ArrayBuffer | null = null;
		for (const c of candidates) {
			if (fs.existsSync(c)) {
				wasmBinary = fs.readFileSync(c).buffer as ArrayBuffer;
				break;
			}
		}
		if (!wasmBinary) throw new Error('sql-wasm.wasm not found next to executable');
		SQL = await initSqlJs({ wasmBinary });
	} else {
		SQL = await initSqlJs();
	}

	// Load existing DB from disk if it exists
	if (fs.existsSync(DB_PATH)) {
		const fileBuffer = fs.readFileSync(DB_PATH);
		db = new SQL.Database(fileBuffer);
	} else {
		db = new SQL.Database();
	}

	// Enable foreign keys
	db.run('PRAGMA foreign_keys = ON');

	// Run schema
	db.exec(SCHEMA);
	
	// Migration: add stats column to messages if missing
	try {
		const cols = db.exec("PRAGMA table_info(messages)");
		const colNames = cols[0]?.values.map((row: any) => row[1]) ?? [];
		if (!colNames.includes('stats')) {
			db.run("ALTER TABLE messages ADD COLUMN stats TEXT");
		}
	} catch {
		// ignore if already exists
	}
	// Initial save

	// Initial save
	saveNow();

	// Save on process exit
	process.on('exit', saveNow);
	process.on('SIGINT', () => { saveNow(); process.exit(); });
	process.on('SIGTERM', () => { saveNow(); process.exit(); });

	await runMcpMigrations();
}

export const mcpDb = {
	// --- Server permissions ---
	async getServerPermission(serverName: string): Promise<IMcpServerPermission | null> {
		return get<IMcpServerPermission>(
			'SELECT serverName, enabled FROM mcp_server_permissions WHERE serverName = ?',
			[serverName]
		);
	},

	async setServerPermission(serverName: string, enabled: boolean): Promise<void> {
		const exists = await get('SELECT 1 FROM mcp_server_permissions WHERE serverName = ?', [serverName]);
		if (exists) {
			await run('UPDATE mcp_server_permissions SET enabled = ? WHERE serverName = ?', [enabled ? 1 : 0, serverName]);
		} else {
			await run('INSERT INTO mcp_server_permissions (serverName, enabled) VALUES (?, ?)', [serverName, enabled ? 1 : 0]);
		}
	},

	async getAllServerPermissions(): Promise<IMcpServerPermission[]> {
		const rows = await all<{ serverName: string; enabled: number }>('SELECT * FROM mcp_server_permissions');
		return rows.map(r => ({ serverName: r.serverName, enabled: r.enabled === 1 }));
	},

	// --- Tool permissions ---
	async getToolPermission(serverName: string, toolName: string): Promise<IToolPermission | null> {
		const row = await get<{ serverName: string; toolName: string; enabled: number; approvalMode: string }>(
			'SELECT * FROM mcp_tool_permissions WHERE serverName = ? AND toolName = ?',
			[serverName, toolName]
		);
		if (!row) return null;
		return {
			serverName: row.serverName,
			toolName: row.toolName,
			enabled: row.enabled === 1,
			approvalMode: row.approvalMode as EToolApprovalMode,
		};
	},

	async setToolPermission(serverName: string, toolName: string, enabled: boolean, approvalMode: EToolApprovalMode): Promise<void> {
		const exists = await get('SELECT 1 FROM mcp_tool_permissions WHERE serverName = ? AND toolName = ?', [serverName, toolName]);
		if (exists) {
			await run(
				'UPDATE mcp_tool_permissions SET enabled = ?, approvalMode = ? WHERE serverName = ? AND toolName = ?',
				[enabled ? 1 : 0, approvalMode, serverName, toolName]
			);
		} else {
			await run(
				'INSERT INTO mcp_tool_permissions (serverName, toolName, enabled, approvalMode) VALUES (?, ?, ?, ?)',
				[serverName, toolName, enabled ? 1 : 0, approvalMode]
			);
		}
	},

	async getAllToolPermissions(): Promise<IToolPermission[]> {
		const rows = await all<{ serverName: string; toolName: string; enabled: number; approvalMode: string }>(
			'SELECT * FROM mcp_tool_permissions'
		);
		return rows.map(r => ({
			serverName: r.serverName,
			toolName: r.toolName,
			enabled: r.enabled === 1,
			approvalMode: r.approvalMode as EToolApprovalMode,
		}));
	},

	async getToolPermissionsForServer(serverName: string): Promise<IToolPermission[]> {
		const rows = await all<{ serverName: string; toolName: string; enabled: number; approvalMode: string }>(
			'SELECT * FROM mcp_tool_permissions WHERE serverName = ?',
			[serverName]
		);
		return rows.map(r => ({
			serverName: r.serverName,
			toolName: r.toolName,
			enabled: r.enabled === 1,
			approvalMode: r.approvalMode as EToolApprovalMode,
		}));
	},

	// --- Tool call records ---
	async createToolCall(tc: IToolCall): Promise<void> {
		await run(
			`INSERT INTO tool_calls (id, messageId, threadId, serverName, toolName, arguments, result, status, error, createdAt, resolvedAt)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[tc.id, tc.messageId, tc.threadId, tc.serverName, tc.toolName, tc.arguments, tc.result, tc.status, tc.error, tc.createdAt, tc.resolvedAt]
		);
	},

	async updateToolCallStatus(id: string, status: EToolCallStatus, result?: string | null, error?: string | null): Promise<void> {
		await run(
			'UPDATE tool_calls SET status = ?, result = ?, error = ?, resolvedAt = ? WHERE id = ?',
			[status, result ?? null, error ?? null, Date.now(), id]
		);
	},

	async getToolCall(id: string): Promise<IToolCall | null> {
		return get<IToolCall>('SELECT * FROM tool_calls WHERE id = ?', [id]);
	},

	async getToolCallsForMessage(messageId: string): Promise<IToolCall[]> {
		return all<IToolCall>('SELECT * FROM tool_calls WHERE messageId = ? ORDER BY createdAt ASC', [messageId]);
	},

	async getToolCallsForThread(threadId: string): Promise<IToolCall[]> {
		return all<IToolCall>('SELECT * FROM tool_calls WHERE threadId = ? ORDER BY createdAt ASC', [threadId]);
	},

	async getPendingToolCalls(): Promise<IToolCall[]> {
		return all<IToolCall>('SELECT * FROM tool_calls WHERE status = ? ORDER BY createdAt ASC', [EToolCallStatus.PENDING]);
	},
};

export const chatDb = { run, get, all };