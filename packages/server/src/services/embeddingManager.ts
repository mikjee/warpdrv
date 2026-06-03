import type { IBridgeEvent } from '@warpcore/bridge';
import type { IBridgeBroadcaster } from '@warpcore/bridge/server';
import type { SqlitePersistence } from '@warpcore/bridge/persistence';
import { EmbeddingService } from '@warpcore/bridge/persistence/embeddingService';
import type { IServer } from '@warpcore/shared';
import { store } from '../util/store';
import { getCachedModels } from '../routes/models';

class EmbeddingManager {
	private embeddingService: EmbeddingService | null = null;
	private persistence: SqlitePersistence | null = null;
	private broadcaster: IBridgeBroadcaster | null = null;
	private unsubscribe: (() => void) | null = null;
	private currentConfig: { serverUrl: string; modelId: string; dim: number; topic: string } | null = null;

	constructor() {}

	async initialize(persistence: SqlitePersistence, broadcaster: IBridgeBroadcaster, dataDir: string): Promise<void> {
		this.persistence = persistence;
		this.broadcaster = broadcaster;
		this.embeddingService = new EmbeddingService();
		this.embeddingService.initialize(persistence, dataDir);
		this.embeddingService.setOnStatusChange((messageId, threadId, modelId, topic) => {
			this.broadcaster!.emit({ type: 'embedding.embedded', messageId, threadId, modelId, topic });
		});
		console.log('[embedding] Initialized, dataDir:', dataDir);
		this.unsubscribe = this.broadcaster.subscribe((event: IBridgeEvent) => {
			if (event.type === 'message.deleted' && this.currentConfig && this.embeddingService) {
				this.embeddingService.deleteByMessageId(
					event.messageId,
					this.currentConfig.modelId,
					this.currentConfig.topic,
					this.currentConfig.serverUrl,
					this.currentConfig.dim
				).catch(err => {
					console.error('[embedding] Failed to delete embedding:', err);
				});
			}
			if (event.type === 'thread.deleted' && this.currentConfig && this.embeddingService && this.persistence) {
				const cfg = this.currentConfig;
				this.persistence.getMessageIdsByThreadId(event.threadId).then(async (messageIds) => {
					for (const messageId of messageIds) {
						await this.embeddingService!.deleteByMessageId(
							messageId,
							cfg.modelId,
							cfg.topic,
							cfg.serverUrl,
							cfg.dim
						);
					}
				}).catch(err => {
					console.error('[embedding] Failed to clean up thread embeddings:', err);
				});
			}
		});
	}

	async configure(serverId: string): Promise<void> {
		if (!this.embeddingService) return;
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) return;
		const serverUrl = `http://127.0.0.1:${server.port}`;
		const modelId = server.modelPath;
		const model = getCachedModels().find(m => m.primaryFile?.filePath === modelId);
		const dim = model?.primaryFile?.metadata?.embeddingDim;
		if (!dim) {
			const msg = `[embedding] Cannot determine embedding dimension for ${modelId} — model not in cache or metadata missing. Run a model scan.`;
			console.error(msg);
			this.broadcaster!.emit({ type: 'embedding.error', error: msg });
			throw new Error(msg);
		}
		const topic = 'global';
		this.currentConfig = { serverUrl, modelId, dim, topic };
		console.log('[embedding] Configured:', server.serverName, 'dim:', dim, 'topic:', topic);
		await this.embeddingService.configure(modelId, topic, serverUrl, dim);
	}

	async embedMessage(messageId: string, serverId: string, topic: string): Promise<void> {
		if (!this.embeddingService || !this.persistence) throw new Error('EmbeddingService not initialized');
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) throw new Error(`Server ${serverId} not found`);
		const serverUrl = `http://127.0.0.1:${server.port}`;
		const modelId = server.modelPath;
		const model = getCachedModels().find(m => m.primaryFile?.filePath === modelId);
		const dim = model?.primaryFile?.metadata?.embeddingDim;
		if (!dim) throw new Error(`Cannot determine embedding dimension for ${modelId}`);
		const message = await this.persistence.getMessage(messageId);
		if (!message) throw new Error(`Message ${messageId} not found`);
		console.log('[embedding] embedMessage queued:', messageId, server.serverName, topic);
		this.embeddingService.queueMessage(message, {
			embeddingServerUrl: serverUrl,
			modelId,
			embeddingDim: dim,
			topic,
			onStatusChange: () => {},
		});
	}

	async deleteEmbedding(messageId: string, serverId: string, topic: string): Promise<void> {
		if (!this.embeddingService) throw new Error('EmbeddingService not initialized');
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) throw new Error(`Server ${serverId} not found`);
		const serverUrl = `http://127.0.0.1:${server.port}`;
		const modelId = server.modelPath;
		const model = getCachedModels().find(m => m.primaryFile?.filePath === modelId);
		const dim = model?.primaryFile?.metadata?.embeddingDim;
		if (!dim) throw new Error(`Cannot determine embedding dimension for ${modelId}`);
		console.log('[embedding] deleteEmbedding:', messageId, server.serverName, topic);
		await this.embeddingService.deleteByMessageId(messageId, modelId, topic, serverUrl, dim);
		this.broadcaster!.emit({ type: 'embedding.removed', messageId, modelId, topic });
	}

	async search(query: string, topK: number): Promise<{ messageId: string; text: string; distance: number }[]> {
		console.log('[embedding] manager.search called, currentConfig:', this.currentConfig ? { serverUrl: this.currentConfig.serverUrl, modelId: this.currentConfig.modelId } : null);
		if (!this.embeddingService || !this.currentConfig) {
			throw new Error('[embedding] search called but no embedding DB is loaded — configure an embedding server first');
		}
		const results = await this.embeddingService.search(query, topK);
		console.log('[embedding] search:', results.length, 'results for', query.slice(0, 50));
		return results;
	}

	async destroy(): Promise<void> {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		if (this.embeddingService) {
			await this.embeddingService.close();
			this.embeddingService = null;
		}
	}
}

export const embeddingManager = new EmbeddingManager();
