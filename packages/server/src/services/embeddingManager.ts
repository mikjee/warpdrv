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

class EmbeddingManager {
	private embeddingService: EmbeddingService | null = null;
	private persistence: SqlitePersistence | null = null;
	private broadcaster: IBridgeBroadcaster | null = null;
	private unsubscribe: (() => void) | null = null;
	private currentModelDim: number | null = null;

	constructor() {}

	async initialize(persistence: SqlitePersistence, broadcaster: IBridgeBroadcaster): Promise<void> {
		this.persistence = persistence;
		this.broadcaster = broadcaster;
		this.embeddingService = new EmbeddingService();
		this.unsubscribe = this.broadcaster.subscribe((event: IBridgeEvent) => {
			if (event.type === 'message.created' && this.embeddingService) {
				this.embeddingService.queueMessage(event.message);
			}
		});
	}

	async configure(serverId: string, dataDir: string): Promise<void> {
		if (!this.persistence || !this.embeddingService) return;
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server) return;
		const serverUrl = `http://127.0.0.1:${server.port}`;
		const modelId = server.modelPath;
		// Get embedding dimension from model metadata
		const dim = this.currentModelDim ?? 1536;
		await this.embeddingService.configure({
			embeddingServerUrl: serverUrl,
			modelId,
			embeddingDim: dim,
			dataDir,
			topic: 'global',
		}, this.persistence);
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
