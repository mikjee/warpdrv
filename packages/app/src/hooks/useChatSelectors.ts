import type { AppState } from '../store/types';
import type { TThreadId, TMessageId, IChatMessage, IToolCall } from '@warpcore/bridge';

// Select active branch from head to root
export function selectActiveMessages(state: AppState, threadId: TThreadId): IChatMessage[] {
	const headId = state.headMessageIdByThread[threadId];
	if (!headId) return [];

	const chain: IChatMessage[] = [];
	let currentId = headId;

	// Walk up via parentId - filter out TOOL role messages
	while (currentId) {
		const msg = state.messagesByThread[threadId]?.[currentId];
		if (!msg) break;
		if (msg.role !== 'tool') {
			chain.push(msg);
		}
		const nextId = msg.parentId;
		if (!nextId) break;
		currentId = nextId;
	}

	return chain.reverse(); // Root to head
}

// Build message chain from a starting point to root (for backend API calls)
// Includes TOOL messages for proper conversation context
export function buildMessageChain(
	state: AppState,
	threadId: TThreadId,
	options: {
		includeToolMessages?: boolean;
		fromId?: TMessageId | null;
	} = {},
): IChatMessage[] {
	const { includeToolMessages = true, fromId } = options;

	// Use provided fromId or fall back to head
	let currentId = fromId ?? state.headMessageIdByThread[threadId];
	if (!currentId) return [];

	const chain: IChatMessage[] = [];

	// Walk up via parentId
	while (currentId) {
		const msg: IChatMessage | undefined = state.messagesByThread[threadId]?.[currentId];
		if (!msg) break;

		// Include or filter based on option
		if (includeToolMessages || msg.role !== 'tool') {
			chain.push(msg);
		}

		currentId = (msg.parentId as TMessageId) ?? null;
	}

	return chain.reverse(); // Root to leaf
}

// Select all messages for backend (includes TOOL messages, uses head)
export function selectActiveMessagesForBackend(state: AppState, threadId: TThreadId): IChatMessage[] {
	return buildMessageChain(state, threadId, { includeToolMessages: true });
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
