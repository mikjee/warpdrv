import type { AppState } from '../store/types';
import type { TThreadId, IChatMessage, IToolCall } from '@warpcore/bridge';

// Select active branch from head to root
export function selectActiveMessages(state: AppState, threadId: TThreadId): IChatMessage[] {
	const headId = state.headMessageIdByThread[threadId];
	if (!headId) return [];

	const chain: IChatMessage[] = [];
	let currentId = headId;

	// Walk up via parentId - DO NOT filter TOOL role messages
	while (currentId) {
		const msg = state.messagesByThread[threadId]?.[currentId];
		if (!msg) break;
		chain.push(msg);
		const nextId = msg.parentId;
		if (!nextId) break;
		currentId = nextId;
	}

	return chain.reverse(); // Root to head
}

// Select tool calls for a thread
export function selectToolCallsForThread(state: AppState, threadId: TThreadId): IToolCall[] {
	return Object.values(state.toolCallsById).filter(tc => tc.threadId === threadId);
}

// Select threads list (for thread list sidebar)
export function selectThreads(state: AppState): AppState['threads'] {
	return state.threads;
}

// Select active thread metadata
export function selectThread(state: AppState, threadId: TThreadId | null): AppState['threads'][TThreadId] | undefined {
	if (!threadId) return undefined;
	return state.threads[threadId];
}
