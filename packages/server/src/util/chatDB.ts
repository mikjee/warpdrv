import initSqlJs, { type Database } from 'sql.js';
import path from 'path';
import os from 'os';
import fs from 'fs';

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
		createdAt INTEGER NOT NULL,
		FOREIGN KEY (threadId) REFERENCES threads(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(threadId, createdAt);
	CREATE INDEX IF NOT EXISTS idx_threads_folder ON threads(folderId);
	CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updatedAt);
`;

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

	// Initial save
	saveNow();

	// Save on process exit
	process.on('exit', saveNow);
	process.on('SIGINT', () => { saveNow(); process.exit(); });
	process.on('SIGTERM', () => { saveNow(); process.exit(); });
}

export const chatDb = { run, get, all };