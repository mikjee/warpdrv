import { useStore } from '@/store';
import type { AppState } from '../store/types';
import type { TThreadId, TMessageId, IChatMessage, IToolCall } from '@warpcore/bridge';
import { EChatRole, EMessagePartType, EToolCallStatus } from '@warpcore/bridge';
import { useCallback, useMemo, useRef } from 'react';
import { ExportedMessageRepository } from '@assistant-ui/react';

function shallowEqualExcluding<T extends object>(
    a: T,
    b: T,
    excludeKey?: keyof T
): boolean {
    const keys = Object.keys(a) as (keyof T)[];
    
    for (const key of keys) {
        if (key === excludeKey) continue;
        if (!(key in b)) return false;
        if (a[key] !== b[key]) return false;
    }
    
    // ensure b has no extra keys (beyond the excluded one)
    for (const key of Object.keys(b) as (keyof T)[]) {
        if (key === excludeKey) continue;
        if (!(key in a)) return false;
    }
    
    return true;
}

type TWrappedConvertedMessage = {
	parentId: string | null;
	message: any;
};

export function useDerivedMsgsForUI(
	msgs: Record<TMessageId, IChatMessage>,
	currentThreadId: string | null,
	headMessageId: TMessageId | null,
	isRunning: boolean,
): {
	msgRepo: ExportedMessageRepository,
	branchTokenCount: number,
} {
	const toolCallsById = useStore(s => s.toolCallsById);

	const derivedMsgsRef = useRef<Record<TMessageId, IChatMessage>>({});
	const convertedMsgsRef = useRef<Record<TMessageId, any>>({});
	const toolCallsByIdRef = useRef<typeof toolCallsById | null>(null);
	const sortedMsgsRef = useRef<TWrappedConvertedMessage[]>([]);
	const lastThreadIdRef = useRef<typeof currentThreadId | null>(null);
	const lastIsRunningRef = useRef<boolean>(false);
	const mapIdToIndexRef = useRef<Record<TMessageId, number>>({});
	const headMessageIdRef = useRef<TMessageId | null>(null);

	const convertMessage = useCallback((msg: any) => {
		
		// Use toolCallsById from closure (already reactive via useStore)
		const threadToolCalls = Object.values(toolCallsById).filter((tc: any) => tc.threadId === currentThreadId);
		const tcMap = new Map(threadToolCalls.map((tc: any) => [tc.id, tc]));
		
		const attachments: any[] = [];
		const content = (msg.content ?? []).map((part: any) => {
			if (part.type === EMessagePartType.ATTACHMENT) {
				if (part.mimeType.startsWith('image/') && part.data) {
					// part.data is raw base64 (no data: prefix — stripped in onNew)
					const base64 = part.data.startsWith('data:') ? part.data.split(',')[1] : part.data;
					const imageUrl = `data:${part.mimeType};base64,${base64}`;
					// Decode base64 to binary Blob for proper File object
					const bytes = atob(base64);
					const blob = new Blob([new Uint8Array(Array.from(bytes, c => c.charCodeAt(0)))], { type: part.mimeType });
					attachments.push({
						id: part.id,
						type: 'image' as const,
						content: [{ type: 'image' as const, image: imageUrl, filename: part.fileName }],
						name: part.fileName,
						file: new File([blob], part.fileName || 'attachment', { type: part.mimeType }),
					});
				} else {
					// Non-image: render as file chip with FileText icon
					attachments.push({
						id: part.id,
						type: 'file' as const,
						content: [],
						name: part.fileName,
						contentType: part.mimeType,
					});
				}
				return null;
			} 
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
			attachments,
		};

		// Set message status based on inference state AND pending tool calls
		// Only the head (newest) assistant message gets "running" status; prior messages are "complete"
		if (isAssistant) {
			if (hasPendingToolCalls) {
				(result as any).status = { type: 'requires-action' as const, reason: 'tool-calls' as const };
			} else if (isRunning && msg.id === headMessageId) {
				(result as any).status = { type: 'running' as const };
			} else {
				(result as any).status = { type: 'complete' as const, reason: 'stop' as const };
			}
		}

		return result;
	}, [currentThreadId, toolCallsById, isRunning, headMessageId]);

	const updateCachedMessage = useCallback((convertedMsg: ReturnType<typeof convertMessage>, isRunningChanged: boolean) => {
		const id = convertedMsg.id;
		const idx = mapIdToIndexRef.current[convertedMsg.id];
		if (idx === undefined) {
			console.error("Could not find message in cache to update!", id, convertedMsg);
			return false;
		}

		const msg = sortedMsgsRef.current[idx];
		if (!msg) {
			console.error("Index lookup fail - Could not find message in cache to update!", id, convertedMsg);
			return false;
		}

		const needReconvert = 
			shallowEqualExcluding(msg.message, convertedMsg, "content")
			|| shallowEqualExcluding(msg.message.metadata.custom || {}, convertedMsg.metadata.custom || {}, "content");
			
		if (needReconvert) {
			if (isRunningChanged && msg.message.role === 'assistant') msg.message.status = convertedMsg.status;
			return false;
		}

		msg.message.content = [...convertedMsg.content];
		if (isRunningChanged && msg.message.role === 'assistant') msg.message.status = convertedMsg.status;
		return true;
	}, []);

	// ---
	
	const sortedMsgs = useMemo(() => {

		// reset all on thread change
		if (
			lastThreadIdRef.current !== currentThreadId 
			// || headMessageIdRef.current !== headMessageId
		) {
			derivedMsgsRef.current = {};
			convertedMsgsRef.current = {};
			toolCallsByIdRef.current = null;
			sortedMsgsRef.current = [];
			mapIdToIndexRef.current = {};
		}

		// prep
		const haveNewToolCalls = toolCallsById !== toolCallsByIdRef.current;
		const hasIsRunningChanged = isRunning !== lastIsRunningRef.current;
		let haveNewMsgs: boolean = false;

		// remove msgs not in current object
		for (const cachedId of Object.keys(derivedMsgsRef.current)) {
			if (!msgs[cachedId]) {
				delete derivedMsgsRef.current[cachedId];
				delete convertedMsgsRef.current[cachedId];
				haveNewMsgs = true;
			}
		}

		// update message by type after conversion / or just update the content
		Object.values(msgs).forEach(msg => {
			const msgId = msg.id;

			if (msg.role === EChatRole.TOOL) {
				if (!derivedMsgsRef.current[msgId] || haveNewToolCalls || hasIsRunningChanged) {
					const isNewMsg = !derivedMsgsRef.current[msgId];

					derivedMsgsRef.current[msgId] = {
						...msg,
						role: EChatRole.ASSISTANT as const,
						content: [],
					};
					convertedMsgsRef.current[msgId] = convertMessage(derivedMsgsRef.current[msgId]);

					if (isNewMsg || haveNewMsgs) haveNewMsgs = true;
					else if (!updateCachedMessage(convertedMsgsRef.current[msgId], hasIsRunningChanged)) haveNewMsgs = true;
				}
			}

			else if ((derivedMsgsRef.current[msgId] !== msg) || haveNewToolCalls || hasIsRunningChanged) {
				const isNewMsg = !derivedMsgsRef.current[msgId];

				derivedMsgsRef.current[msgId] = msg;
				convertedMsgsRef.current[msgId] = convertMessage(msg);

				if (isNewMsg || haveNewMsgs) haveNewMsgs = true;
				else if (!updateCachedMessage(convertedMsgsRef.current[msgId], hasIsRunningChanged)) haveNewMsgs = true;
			}
		});

		// early exit
		toolCallsByIdRef.current = toolCallsById;
		lastIsRunningRef.current = isRunning;
		if (!haveNewMsgs) return sortedMsgsRef.current;

		// no early exit - have new msgs must reconstruct array
		const sortedMessages = Object.values(convertedMsgsRef.current)
			.sort((a, b) => a.createdAt - b.createdAt)
			.map((msg) => ({
				parentId: msgs[msg.id]!.parentId ?? null,
				message: msg,
			}));

		// update refs
		sortedMsgsRef.current = sortedMessages;

		// Update o(1) lookup
		mapIdToIndexRef.current = {};
		sortedMessages.forEach((m, idx) => mapIdToIndexRef.current[m.message.id] = idx);
		
		// done
		return sortedMessages;
	}, [msgs, convertMessage, toolCallsById, currentThreadId, isRunning, headMessageId]);

	// Update thread ref
	lastThreadIdRef.current = currentThreadId;
	headMessageIdRef.current = headMessageId;
	
	return useMemo(() => {
		return {
			msgRepo: {
				messages: sortedMsgs,
				headId: headMessageId,
			},

			branchTokenCount: (() => {
				if (!headMessageId) return 0;

				let tokenCount = 0;
				const branchMsgIds = new Set<string>();
				let msg: IChatMessage | undefined = derivedMsgsRef.current[headMessageId];
				while (msg) {
					branchMsgIds.add(msg.id);
					tokenCount += msg.stats?.actualTokens || 0;
					msg = msg.parentId ? derivedMsgsRef.current[msg.parentId] : undefined;
				}

				// Add tool call arguments + result tokens for tool calls in this branch
				for (const tc of Object.values(toolCallsById)) {
					if (branchMsgIds.has(tc.messageId)) {
						tokenCount += Math.ceil((tc.arguments.length + (tc.result?.length || 0)) / 4);
					}
				}

				return tokenCount;
			})()
		};
	}, [sortedMsgs, headMessageId, isRunning, toolCallsById]);
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
