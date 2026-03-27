import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

// Resolve data dir (same logic as store.ts)
function getDataDir(): string {
	const platform = os.platform();
	if (platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	return path.join(os.homedir(), '.config', 'warpcore');
}

const DB_PATH = path.join(getDataDir(), 'chat.db');

let db: sqlite3.Database | null = null;

// Core async wrappers
function run(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
	return new Promise((resolve, reject) => {
		db!.run(sql, params, function (err) {
			if (err) reject(err);
			else resolve(this);
		});
	});
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | null> {
	return new Promise((resolve, reject) => {
		db!.get(sql, params, (err, row) => {
			if (err) reject(err);
			else resolve((row as T) ?? null);
		});
	});
}

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => {
		db!.all(sql, params, (err, rows) => {
			if (err) reject(err);
			else resolve((rows as T[]) ?? []);
		});
	});
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
	return new Promise((resolve, reject) => {
		db = new sqlite3.Database(DB_PATH, (err) => {
			if (err) {
				reject(err);
				return;
			}
			// Enable WAL mode for better concurrent read/write
			db!.run('PRAGMA journal_mode=WAL', () => {
				// Enable foreign keys
				db!.run('PRAGMA foreign_keys=ON', () => {
					db!.exec(SCHEMA, (err) => {
						if (err) reject(err);
						else resolve();
					});
				});
			});
		});
	});
}

export const chatDb = { run, get, all };