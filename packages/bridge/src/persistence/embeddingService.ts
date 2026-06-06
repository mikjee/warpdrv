import fs from 'fs';
import path from 'path';
import type { IChatMessage } from '../types';
import { EChatRole, EMessagePartType } from '../types';
import type { SqlitePersistence } from './betterSqlite';
import { EmbeddingStore } from './embeddingStore';
import type { IEmbeddingSearchResult } from './embeddingStore';

export interface IEmbeddingConfig {
	embeddingServerUrl: string;
	modelId: string;
	embeddingDim: number;
	topic: string;
	onStatusChange: (messageId: string, threadId: string, modelId: string, topic: string) => void;
}

export interface IEmbeddingTask {
	messageId: string;
	threadId: string;
	text: string;
	modelId: string;
	topic: string;
	serverUrl: string;
	dim: number;
}

export class EmbeddingService {
	private queue: IEmbeddingTask[] = [];
	private queuedIds = new Set<string>();
	private processing = false;
	private store: EmbeddingStore | null = null;
	private currentInfo: { modelId: string; topic: string; serverUrl: string; dim: number } | null = null;
	private persistence: SqlitePersistence | null = null;
	private dataDir: string | null = null;
	private onStatusChange: ((messageId: string, threadId: string, modelId: string, topic: string) => void) | null = null;

	constructor() {}

	initialize(persistence: SqlitePersistence, dataDir: string): void {
		this.persistence = persistence;
		this.dataDir = dataDir;
	}

	setOnStatusChange(fn: (messageId: string, threadId: string, modelId: string, topic: string) => void): void {
		this.onStatusChange = fn;
	}

	async configure(modelId: string, topic: string, serverUrl: string, dim: number): Promise<void> {
		if (this.currentInfo &&
			this.currentInfo.modelId === modelId &&
			this.currentInfo.topic === topic &&
			this.currentInfo.serverUrl === serverUrl) {
			return;
		}
		await this.getOrCreateStore(modelId, topic, dim);
		this.currentInfo = { modelId, topic, serverUrl, dim };
	}

	async getOrCreateStore(modelId: string, topic: string, dim: number): Promise<EmbeddingStore> {
		if (this.currentInfo &&
			this.currentInfo.modelId === modelId &&
			this.currentInfo.topic === topic) {
			return this.store!;
		}
		if (this.store) {
			await this.store.close();
		}
		const modelName = path.basename(modelId, '.gguf');
		const topicDir = path.join(this.dataDir!, 'embeddings', topic);
		if (!fs.existsSync(topicDir)) fs.mkdirSync(topicDir, { recursive: true });
		const dbPath = path.join(topicDir, `${modelName}.db`);
		this.store = new EmbeddingStore(dbPath, dim);
		console.log('[embedding] Store loaded:', dbPath);
		return this.store;
	}

	async close(): Promise<void> {
		if (this.store) {
			await this.store.close();
			this.store = null;
		}
		this.currentInfo = null;
		this.onStatusChange = null;
	}

	async renameTopic(oldTopic: string, newTopic: string): Promise<void> {
		if (this.store && this.currentInfo && this.currentInfo.topic === oldTopic) {
			await this.store.close();
			this.store = null;
			this.currentInfo = null;
		}
		const oldDir = path.join(this.dataDir!, 'embeddings', oldTopic);
		const newDir = path.join(this.dataDir!, 'embeddings', newTopic);
		if (fs.existsSync(oldDir)) {
			fs.renameSync(oldDir, newDir);
			console.log('[embedding] Renamed embeddings dir:', oldDir, '->', newDir);
		}
	}

	async embedMessage(messageId: string, modelId: string, topic: string, serverUrl: string, dim: number): Promise<void> {
		await this.configure(modelId, topic, serverUrl, dim);
		const message = await this.persistence!.getMessage(messageId);
		if (!message) throw new Error(`Message ${messageId} not found`);
		if (message.role === EChatRole.TOOL) throw new Error('Cannot embed TOOL messages');
		const text = this.extractEmbeddableText(message);
		if (!text || text.trim().length === 0) throw new Error('No embeddable text in message');

		const store = await this.getOrCreateStore(modelId, topic, dim);
		const vector = await this.getEmbeddingFromUrl(text, serverUrl, modelId);
		await store.insertVector(messageId, text, vector);
		await this.persistence!.insertEmbeddingStatus(messageId, message.threadId, modelId, topic);
		this.onStatusChange?.(messageId, message.threadId, modelId, topic);
		console.log('[embedding] Embedded message:', messageId);
	}

	async deleteByMessageId(messageId: string, modelId: string, topic: string, serverUrl: string, dim: number): Promise<void> {
		await this.configure(modelId, topic, serverUrl, dim);
		console.log('[embedding] Deleting embedding:', messageId, topic);
		const store = await this.getOrCreateStore(modelId, topic, dim);
		await store.deleteByMessageId(messageId);
		if (this.persistence) {
			await this.persistence.deleteEmbeddingStatus(messageId, modelId, topic);
		}
		this.queuedIds.delete(messageId);
	}

	async search(query: string, topK: number): Promise<IEmbeddingSearchResult[]> {
		console.log('[embedding] service.search called, store:', this.store ? 'loaded' : null, 'currentInfo:', this.currentInfo ? { modelId: this.currentInfo.modelId, serverUrl: this.currentInfo.serverUrl } : null);
		if (!this.store) throw new Error('No store loaded');
		if (!this.currentInfo) throw new Error('Not configured');
		const vector = await this.getEmbeddingFromUrl(query, this.currentInfo.serverUrl, this.currentInfo.modelId);
		const results = await this.store.search(vector, topK);
		console.log('[embedding] Search returned', results.length, 'results');
		return results;
	}

	async queueMessage(message: IChatMessage, config: IEmbeddingConfig): Promise<void> {
		if (!this.persistence) return;
		if (message.role === EChatRole.TOOL) return;
		if (this.queuedIds.has(message.id)) return;
		const text = this.extractEmbeddableText(message);
		if (!text || text.trim().length === 0) return;
		this.queuedIds.add(message.id);
		this.queue.push({
			messageId: message.id,
			threadId: message.threadId,
			text,
			modelId: config.modelId,
			topic: config.topic,
			serverUrl: config.embeddingServerUrl,
			dim: config.embeddingDim,
		});
		setImmediate(() => this.processQueue());
	}

	async processQueue(): Promise<void> {
		if (this.processing || !this.persistence || !this.onStatusChange) return;
		this.processing = true;
		console.log('[embedding] Queue processing, pending:', this.queue.length);
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (!task) continue;
			try {
				await this.configure(task.modelId, task.topic, task.serverUrl, task.dim);
				const store = await this.getOrCreateStore(task.modelId, task.topic, task.dim);
				const vector = await this.getEmbeddingFromUrl(task.text, task.serverUrl, task.modelId);
				await store.insertVector(task.messageId, task.text, vector);
				await this.persistence.insertEmbeddingStatus(task.messageId, task.threadId, task.modelId, task.topic);
				this.onStatusChange(task.messageId, task.threadId, task.modelId, task.topic);
				console.log('[embedding] Queue done:', task.messageId);
			} catch (err) {
				console.error(`[embedding] Failed to embed message ${task.messageId}:`, err);
			} finally {
				this.queuedIds.delete(task.messageId);
			}
		}
		this.processing = false;
	}

	private async getEmbeddingFromUrl(text: string, serverUrl: string, modelId: string): Promise<number[]> {
		const res = await fetch(`${serverUrl}/v1/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ input: text, model: modelId }),
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
		}
		return parts.join('\n').trim();
	}
}
