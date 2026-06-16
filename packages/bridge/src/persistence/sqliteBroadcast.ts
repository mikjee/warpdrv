// ============================================================
// warpbridge/src/persistence/sqliteBroadcast.ts
// Extends SqlitePersistence to emit broadcast events on state updates.
// ============================================================
import type { IBridgeBroadcaster } from '../types/interfaces';
import type { IBetterSqlitePersistenceOptions } from './betterSqlite';
import { SqlitePersistence } from './betterSqlite';
import type { TFolderId, TThreadId, TMessageId } from '../types';

export class SqlitePersistenceWithBroadcast extends SqlitePersistence {
	constructor(dbPath: string, options: IBetterSqlitePersistenceOptions, private broadcaster: IBridgeBroadcaster) {
		super(dbPath, options);
	}

	async updateWorkspaceState(folderId: TFolderId, data: Record<string, unknown>): Promise<void> {
		await super.updateWorkspaceState(folderId, data);
		this.broadcaster.emit({ type: 'workspace_state.updated', folderId, data });
	}

	async updateThreadState(threadId: TThreadId, data: Record<string, unknown>): Promise<void> {
		await super.updateThreadState(threadId, data);
		this.broadcaster.emit({ type: 'thread_state.updated', threadId, data });
	}

	async updateMessageState(messageId: TMessageId, data: Record<string, unknown>): Promise<void> {
		await super.updateMessageState(messageId, data);
		this.broadcaster.emit({ type: 'message_state.updated', messageId, data });
	}
}
