// ============================================================
// bridge/src/persistence/embeddingStore.ts
// Vector storage using sqlite-vec. Per-model KB files.
// ============================================================
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { load as loadSqliteVec } from 'sqlite-vec';

export interface IEmbeddingSearchResult {
	messageId: string;
	text: string;
	distance: number;
}

export class EmbeddingStore {
	private db: Database.Database | null = null;
	private dim: number;

	constructor(dbPath: string, dim: number) {
		this.dim = dim;
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		this.db = new Database(dbPath);
		loadSqliteVec(this.db);
		this.db.pragma('journal_mode = WAL');
		this.initTable();
	}

	private initTable(): void {
		if (!this.db) return;
		this.db.exec(
			`CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(embedding float[${this.dim}] distance_metric=cosine)`
		);
		this.db.exec(
			`CREATE TABLE IF NOT EXISTS embedding_meta (
				rowid INTEGER PRIMARY KEY,
				messageId TEXT NOT NULL,
				text TEXT NOT NULL
			)`
		);
		this.db.exec(
			`CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_meta_messageId ON embedding_meta(messageId)`
		);
	}

	async insertVector(messageId: string, text: string, vector: number[]): Promise<number> {
		if (!this.db) throw new Error('EmbeddingStore not initialized');
		if (vector.length !== this.dim) {
			throw new Error(`Vector dimension mismatch: expected ${this.dim}, got ${vector.length}`);
		}
		const vectorBlob = Buffer.from(new Float32Array(vector).buffer);
		const existing = this.db.prepare(
			`SELECT rowid FROM embedding_meta WHERE messageId = ?`
		).get(messageId) as { rowid: number } | undefined;

		if (existing) {
			this.db.prepare(
				`UPDATE embeddings SET embedding = ? WHERE rowid = ?`
			).run(vectorBlob, existing.rowid);
			this.db.prepare(
				`UPDATE embedding_meta SET text = ? WHERE rowid = ?`
			).run(text, existing.rowid);
			return existing.rowid;
		}

		this.db.prepare(
			`INSERT INTO embeddings (embedding) VALUES (?)`
		).run(vectorBlob);
		const rowid = Number(this.db.lastInsertRowid);
		this.db.prepare(
			`INSERT INTO embedding_meta (rowid, messageId, text) VALUES (?, ?, ?)`
		).run(rowid, messageId, text);
		return rowid;
	}

	async search(queryVector: number[], topK: number): Promise<IEmbeddingSearchResult[]> {
		if (!this.db) throw new Error('EmbeddingStore not initialized');
		if (queryVector.length !== this.dim) {
			throw new Error(`Vector dimension mismatch: expected ${this.dim}, got ${queryVector.length}`);
		}
		const queryBlob = Buffer.from(new Float32Array(queryVector).buffer);
		const rows = this.db.prepare(
			`WITH knn AS (
				SELECT rowid, distance
				FROM embeddings
				WHERE embedding MATCH ? AND k = ?
			)
			SELECT m.messageId, m.text, knn.distance AS distance
			FROM knn
			JOIN embedding_meta m ON m.rowid = knn.rowid
			ORDER BY knn.distance`
		).all(queryBlob, topK) as Array<{ messageId: string; text: string; distance: number }>;
		return rows;
	}

	async deleteByMessageId(messageId: string): Promise<void> {
		if (!this.db) throw new Error('EmbeddingStore not initialized');
		const meta = this.db.prepare(
			`SELECT rowid FROM embedding_meta WHERE messageId = ?`
		).get(messageId) as { rowid: number } | undefined;
		if (!meta) return;
		this.db.prepare(`DELETE FROM embeddings WHERE rowid = ?`).run(meta.rowid);
		this.db.prepare(`DELETE FROM embedding_meta WHERE rowid = ?`).run(meta.rowid);
	}

	async close(): Promise<void> {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
