// ============================================================
// server/src/services/embeddingManager.ts
// Server-side embedding manager. Subscribes to broadcaster,
// queues messages for embedding when embedding is enabled.
// ============================================================
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
	private configuredServerId: string | null = null;

	constructor() {}

	async initialize(persistence: SqlitePersistence, broadcaster: IBridgeBroadcaster): Promise<void> {
		this.persistence = persistence;
		this.broadcaster = broadcaster;
		this.embeddingService = new EmbeddingService();
		this.unsubscribe = this.broadcaster.subscribe((event: IBridgeEvent) => {
			if (event.type === 'message.created' && this.embeddingService) {
				this.embeddingService.queueMessage(event.message);
			}
			if (event.type === 'message.deleted' && this.embeddingService) {
				this.embeddingService.deleteByMessageId(event.messageId).catch(err => {
					console.error('[embedding] Failed to delete embedding:', err);
				});
			}
			if (event.type === 'thread.deleted' && this.embeddingService && this.persistence) {
				this.persistence.getMessageIdsByThreadId(event.threadId).then(async (messageIds) => {
					for (const messageId of messageIds) {
						await this.embeddingService!.deleteByMessageId(messageId);
					}
				}).catch(err => {
					console.error('[embedding] Failed to clean up thread embeddings:', err);
				});
			}
		});
	}

	async configure(serverId: string, dataDir: string): Promise<void> {
		if (!this.persistence || !this.embeddingService) return;
		if (this.configuredServerId === serverId) return;
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) return;
		const serverUrl = `http://127.0.0.1:${server.port}`;
		const modelId = server.modelPath;
		const model = getCachedModels().find(m => m.primaryFile?.filePath === modelId);
		const dim = model?.primaryFile?.metadata?.embeddingDim ?? 1536;
		await this.embeddingService.configure({
			embeddingServerUrl: serverUrl,
			modelId,
			embeddingDim: dim,
			dataDir,
			topic: 'global',
		}, this.persistence);
		this.configuredServerId = serverId;
	}

	async search(query: string, topK: number): Promise<{ messageId: string; text: string; distance: number }[]> {
		if (!this.embeddingService) return [];
		return this.embeddingService.search(query, topK);
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
