import { Level } from 'level';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', '.warpcore-db');

// Single LevelDB instance — all data stored as JSON strings under namespaced keys
const db = new Level<string, string>(DB_PATH, { valueEncoding: 'utf8' });

export const store = {
	async get<T>(key: string): Promise<T | null> {
		try {
			const raw = await db.get(key);
			if (raw === undefined || raw === null) return null;
			return JSON.parse(raw) as T;
		} catch (err: unknown) {
			if ((err as { code?: string }).code === 'LEVEL_NOT_FOUND') return null;
			throw err;
		}
	},

	async put<T>(key: string, value: T): Promise<void> {
		await db.put(key, JSON.stringify(value));
	},

	async del(key: string): Promise<void> {
		try {
			await db.del(key);
		} catch (err: unknown) {
			if ((err as { code?: string }).code === 'LEVEL_NOT_FOUND') return;
			throw err;
		}
	},

	async list<T>(prefix: string): Promise<T[]> {
		const results: T[] = [];
		for await (const [, value] of db.iterator({
			gte: prefix,
			lte: prefix + '\xFF',
		})) {
			results.push(JSON.parse(value) as T);
		}
		return results;
	},

	async keys(prefix: string): Promise<string[]> {
		const results: string[] = [];
		for await (const [key] of db.iterator({
			gte: prefix,
			lte: prefix + '\xFF',
			values: false,
		})) {
			results.push(key);
		}
		return results;
	},
};
