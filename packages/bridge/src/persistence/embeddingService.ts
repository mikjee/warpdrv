// ============================================================
// bridge/src/persistence/embeddingService.ts
// Embedding queue, text stripping, HTTP client for /v1/embeddings
// ============================================================
import path from 'path';
import type { IChatMessage, IMessagePart } from '../types';
import { EChatRole, EMessagePartType } from '../types';
import type { SqlitePersistence } from './betterSqlite';
import { EmbeddingStore } from './embeddingStore';
import type { IEmbeddingSearchResult } from './embeddingStore';

export interface IEmbeddingConfig {
	embeddingServerUrl: string;
	modelId: string;
	embeddingDim: number;
	dataDir: string;
	topic: string;
}

export interface IEmbeddingTask {
	messageId: string;
	text: string;
	modelId: string;
}

export class EmbeddingService {
	private queue: IEmbeddingTask[] = [];
	private queuedIds = new Set<string>();
	private processing = false;
	private config: IEmbeddingConfig | null = null;
	private store: EmbeddingStore | null = null;
	private persistence: SqlitePersistence | null = null;

	constructor() {}

	async initialize(config: IEmbeddingConfig, persistence: SqlitePersistence): Promise<void> {
		this.config = config;
		this.persistence = persistence;
		const modelName = path.basename(config.modelId, '.gguf');
		const dbPath = path.join(config.dataDir, 'embeddings', `${config.topic}-${modelName}.db`);
		this.store = new EmbeddingStore(dbPath, config.embeddingDim);
		await this.processQueue();
	}

	async configure(config: IEmbeddingConfig, persistence: SqlitePersistence): Promise<void> {
		await this.close();
		await this.initialize(config, persistence);
	}

	async close(): Promise<void> {
		if (this.store) {
			await this.store.close();
			this.store = null;
		}
		this.config = null;
	}

	getConfig(): IEmbeddingConfig | null {
		return this.config;
	}

	async queueMessage(message: IChatMessage): Promise<void> {
		if (!this.config || !this.persistence) return;
		if (message.role === EChatRole.TOOL) return;
		if (this.queuedIds.has(message.id)) return;
		const text = this.extractEmbeddableText(message);
		if (!text || text.trim().length === 0) return;
		const modelId = this.config.modelId;
		await this.persistence.upsertEmbeddingStatus(message.id, modelId, 'PENDING');
		this.queuedIds.add(message.id);
		this.queue.push({ messageId: message.id, text, modelId });
		setImmediate(() => this.processQueue());
	}

	private async processQueue(): Promise<void> {
		if (this.processing || !this.config || !this.store || !this.persistence) return;
		this.processing = true;
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (!task) continue;
			try {
				const vector = await this.getEmbedding(task.text);
				const vectorId = await this.store.insertVector(task.messageId, task.text, vector);
				await this.persistence.upsertEmbeddingStatus(task.messageId, this.config.modelId, 'EMBEDDED', vectorId);
			} catch (err) {
				console.error(`[embedding] Failed to embed message ${task.messageId}:`, err);
				await this.persistence.upsertEmbeddingStatus(task.messageId, this.config.modelId, 'FAILED');
			} finally {
				this.queuedIds.delete(task.messageId);
			}
		}
		this.processing = false;
	}

	private async getEmbedding(text: string): Promise<number[]> {
		if (!this.config) throw new Error('EmbeddingService not configured');
		const res = await fetch(`${this.config.embeddingServerUrl}/v1/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input: text, model: this.config.modelId }),
		});
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`Embedding API error: ${res.status} ${body}`);
		}
		const data: { data?: { embedding: number[] }[] } = await res.json();
		if (data.data && data.data[0] && data.data[0].embedding) {
			return data.data[0].embedding;
		}
		throw new Error('Unexpected embedding response format');
	}

	async search(query: string, topK: number): Promise<IEmbeddingSearchResult[]> {
		if (!this.config || !this.store) throw new Error('EmbeddingService not configured');
		const vector = await this.getEmbedding(query);
		return this.store.search(vector, topK);
	}

	async deleteByMessageId(messageId: string): Promise<void> {
		if (!this.store) return;
		await this.store.deleteByMessageId(messageId);
		if (this.persistence) {
			await this.persistence.deleteEmbeddingStatus(messageId);
		}
		this.queuedIds.delete(messageId);
	}

	private extractEmbeddableText(message: IChatMessage): string {
		const parts: string[] = [];
		for (const part of message.content) {
			if (part.type === EMessagePartType.TEXT && part.text) {
				parts.push(part.text);
			} else if (part.type === EMessagePartType.REASONING && part.text) {
				const stripped = part.text.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
				if (stripped.trim()) {
					parts.push(stripped.trim());
				}
			}
			// Skip TOOL_CALL, ATTACHMENT
		}
		return parts.join('\n').trim();
	}
}
