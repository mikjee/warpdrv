import { useStore } from '@/store';
import type { AppState } from '../store/types';
import type { TThreadId, TMessageId, IChatMessage, IToolCall } from '@warpcore/bridge';
import { EChatRole, EMessagePartType, EToolCallStatus } from '@warpcore/bridge';
import { useCallback, useMemo, useRef } from 'react';
import { ExportedMessageRepository } from '@assistant-ui/react';

export function useDerivedMsgsForUI(
	msgs: Record<TMessageId, IChatMessage>,
	currentThreadId: string | null,
	headMessageId: TMessageId | null,
): ExportedMessageRepository {
	const toolCallsById = useStore(s => s.toolCallsById);

	const derivedMsgsRef = useRef<Record<TMessageId, IChatMessage>>({});
	const convertedMsgsRef = useRef<Record<TMessageId, any>>({});
	const toolCallsByIdRef = useRef<typeof toolCallsById>(toolCallsById);

	const convertMessage = useCallback((msg: any) => {
			
		// Use toolCallsById from closure (already reactive via useStore)
		const threadToolCalls = Object.values(toolCallsById).filter((tc: any) => tc.threadId === currentThreadId);
		const tcMap = new Map(threadToolCalls.map((tc: any) => [tc.id, tc]));
		
		const content = (msg.content ?? []).map((part: any) => {
			// Convert TOOL_CALL parts to tool-call format
			if (part.type === EMessagePartType.TOOL_CALL) {
				const tc = tcMap.get(part.toolCallId);
				if (tc) {
					return {
						type: 'tool-call' as const,
						toolCallId: tc.id,
						toolName: tc.toolName,
						args: JSON.parse(tc.arguments),
						argsText: tc.arguments,
						result: tc.result ? JSON.parse(tc.result) : undefined,
						serverName: tc.serverName,
					};
				}
				return null;
			}
			if (part.type === EMessagePartType.TEXT) {
				return { type: 'text' as const, text: part.text || '' };
			}
			if (part.type === EMessagePartType.REASONING) {
				const reasoningText = part.text || '';
				return { type: 'reasoning' as const, reasoning: reasoningText, text: reasoningText };
			}
			return { type: 'text' as const, text: '' };
		}).filter(Boolean);

		const isAssistant = msg.role === EChatRole.ASSISTANT;

		// Check if this assistant message has any pending tool calls
		const hasPendingToolCalls = isAssistant && content.some(
			(part: any) => part.type === 'tool-call' && 
							part.toolCallId && 
							tcMap.get(part.toolCallId)?.status === EToolCallStatus.PENDING
		);

		const result: any = {
			id: msg.id,
			role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
			content: content as any,
			createdAt: new Date(msg.createdAt),
			metadata: { unstable_state: {}, custom: msg.stats || {} },
			attachments: [],
		};

		// Set message status based on whether there are pending tool calls
		if (isAssistant) {
			result.status = hasPendingToolCalls 
				? { type: 'requires-action' as const, reason: 'tool-calls' as const }
				: { type: 'complete' as const, reason: 'stop' as const };
		}

		return result;
	}, [currentThreadId, toolCallsById]);

	// ---
	
	const sortedMsgs = useMemo(() => {
		const haveNewToolCalls = toolCallsById !== toolCallsByIdRef.current;

		Object.values(msgs).forEach(msg => {
			const msgId = msg.id;

			if (msg.role === EChatRole.TOOL) {
				if (!derivedMsgsRef.current[msgId] || haveNewToolCalls) {
					derivedMsgsRef.current[msgId] = {
						...msg,
						role: EChatRole.ASSISTANT as const,
						content: [],
					};
					convertedMsgsRef.current[msgId] = convertMessage(derivedMsgsRef.current[msgId]);
				}
			}

			else if ((derivedMsgsRef.current[msgId] !== msg) || haveNewToolCalls) {
				derivedMsgsRef.current[msgId] = msg;
				convertedMsgsRef.current[msgId] = convertMessage(msg);
			}
		});

		for (const cachedId of Object.keys(derivedMsgsRef.current)) {
			if (!msgs[cachedId]) {
				delete derivedMsgsRef.current[cachedId];
				delete convertedMsgsRef.current[cachedId];
			}
		}

		const sortedMessages = Object.values(convertedMsgsRef.current)
			.map(msg => convertedMsgsRef.current[msg.id]!)
			.sort((a, b) => a.createdAt - b.createdAt);

		toolCallsByIdRef.current = toolCallsById;

		return sortedMessages.map((msg) => ({
			parentId: msgs[msg.id]?.parentId ?? null,
			message: msg,
		}));
	}, [msgs, convertMessage, toolCallsById]);
	
	return useMemo(() => {
		return {
			messages: sortedMsgs,
			headId: headMessageId,  // Use the stored head, not recalculated
		};
	}, [sortedMsgs, headMessageId]);
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
