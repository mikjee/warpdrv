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
	private currentConfig: { serverId: string; serverUrl: string; modelId: string; dim: number } | null = null;

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
		this.currentConfig = { serverId, serverUrl, modelId, dim };
		console.log('[embedding] Configured:', server.serverName, 'dim:', dim);
		await this.embeddingService.configure(modelId, 'global', serverUrl, dim);
		this.broadcaster!.emit({ type: 'embedding.configured', serverId });
	}

	async embedMessage(messageId: string, topic: string): Promise<void> {
		if (!this.embeddingService || !this.persistence || !this.currentConfig) throw new Error('EmbeddingService not configured');
		const cfg = this.currentConfig;
		await this.embeddingService.configure(cfg.modelId, topic, cfg.serverUrl, cfg.dim);
		const message = await this.persistence.getMessage(messageId);
		if (!message) throw new Error(`Message ${messageId} not found`);
		console.log('[embedding] embedMessage queued:', messageId, topic);
		this.embeddingService.queueMessage(message, {
			embeddingServerUrl: cfg.serverUrl,
			modelId: cfg.modelId,
			embeddingDim: cfg.dim,
			topic,
			onStatusChange: () => {},
		});
	}

	async search(query: string, topK: number, topic: string): Promise<{ messageId: string; text: string; distance: number }[]> {
		console.log('[embedding] manager.search called, topic:', topic, 'currentConfig:', this.currentConfig ? { serverUrl: this.currentConfig.serverUrl, modelId: this.currentConfig.modelId } : null);
		if (!this.embeddingService || !this.currentConfig) {
			throw new Error('[embedding] search called but no embedding DB is loaded — configure an embedding server first');
		}
		const cfg = this.currentConfig;
		await this.embeddingService.configure(cfg.modelId, topic, cfg.serverUrl, cfg.dim);
		const results = await this.embeddingService.search(query, topK);
		console.log('[embedding] search:', results.length, 'results for', query.slice(0, 50));
		return results;
	}

	getCurrentServerId(): string | null {
		return this.currentConfig?.serverId ?? null;
	}

	async renameTopic(oldTopic: string, newTopic: string): Promise<void> {
		if (!this.embeddingService) throw new Error('EmbeddingService not initialized');
		await this.embeddingService.renameTopic(oldTopic, newTopic);
	}

	async deleteEmbeddingsForThread(embeddings: Array<{ messageId: string; modelId: string; topic: string }>): Promise<void> {
		if (!this.embeddingService) throw new Error('EmbeddingService not initialized');
		if (!embeddings.length) return;
		// Group by unique (modelId, topic) to minimize store switches
		const groups = new Map<string, { modelId: string; topic: string; messageIds: string[] }>();
		for (const e of embeddings) {
			const key = `${e.modelId}::${e.topic}`;
			const group = groups.get(key);
			if (group) {
				group.messageIds.push(e.messageId);
			} else {
				groups.set(key, { modelId: e.modelId, topic: e.topic, messageIds: [e.messageId] });
			}
		}
		for (const group of groups.values()) {
			const store = await this.embeddingService.getOrCreateStore(group.modelId, group.topic, 0);
			for (const messageId of group.messageIds) {
				await store.deleteByMessageId(messageId);
			}
		}
	}

	async deleteEmbeddingForMessage(messageId: string, threadId: string): Promise<void> {
		if (!this.embeddingService || !this.persistence) throw new Error('EmbeddingService not initialized');
		const thread = await this.persistence.getThread(threadId);
		const folderId = thread?.folderId;
		const topic = folderId ? (await this.persistence.getFolder(folderId))?.topic ?? 'global' : 'global';
		if (!this.currentConfig) throw new Error('EmbeddingService not configured');
		const cfg = this.currentConfig;
		await this.embeddingService.deleteByMessageId(messageId, cfg.modelId, topic, cfg.serverUrl, cfg.dim);
		this.broadcaster!.emit({ type: 'embedding.removed', messageId, modelId: cfg.modelId, topic });
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
