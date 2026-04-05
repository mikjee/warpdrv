// ============================================================
// warpbridge/src/store/index.ts
// Optional Zustand store for frontend state management.
// Universal — browser + Node (Zustand works in both).
// Consumers can skip this entirely and manage state themselves.
// Uses Immer pattern for mutable-like state updates.
// ============================================================

import type {
	IChatThread,
	IChatMessage,
	IToolCall,
	IMcpServerState,
	IToolPermission,
	IServerPermission,
	TThreadId,
	TToolCallId,
	EStreamStatus,
} from '../types';
import type { WritableDraft } from 'immer';

// ============================================================
// Immer-compatible set/get types (matches WarpCore pattern)
// ============================================================
export type ImmerSet<T> = (fn: (state: WritableDraft<T>) => void) => void;
export type ImmerGet<T> = () => T;

// ============================================================
// Store state shape
// ============================================================
export interface IChatStoreState {
	// Threads
	threads: IChatThread[];
	activeThreadId: TThreadId | null;

	// Messages for active thread
	messages: IChatMessage[];

	// Streaming
	streamStatus: EStreamStatus;
	streamingText: string;
	streamingReasoning: string;

	// Tool calls for active thread
	toolCalls: IToolCall[];

	// MCP
	mcpServers: Record<string, IMcpServerState>;
	serverPermissions: IServerPermission[];
	toolPermissions: IToolPermission[];

	// Actions
	setThreads: (threads: IChatThread[]) => void;
	setActiveThread: (id: TThreadId | null) => void;
	setMessages: (messages: IChatMessage[]) => void;
	appendMessage: (message: IChatMessage) => void;
	setStreamStatus: (status: EStreamStatus) => void;
	setStreamingText: (text: string) => void;
	setStreamingReasoning: (text: string) => void;
	setToolCalls: (toolCalls: IToolCall[]) => void;
	updateToolCall: (id: TToolCallId, updates: Partial<IToolCall>) => void;
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) => void;
	reset: () => void;
}

// ============================================================
// Slice creator — for use with Zustand's slice pattern.
// Uses Immer for mutable-like updates. Compatible with WarpCore's store.
// ============================================================
export function createChatStoreSlice(
	set: ImmerSet<IChatStoreState>,
	_get: ImmerGet<IChatStoreState>,
): IChatStoreState {
	const initialState = {
		threads: [] as IChatThread[],
		activeThreadId: null as TThreadId | null,
		messages: [] as IChatMessage[],
		streamStatus: 'IDLE' as EStreamStatus,
		streamingText: '',
		streamingReasoning: '',
		toolCalls: [] as IToolCall[],
		mcpServers: {} as Record<string, IMcpServerState>,
		serverPermissions: [] as IServerPermission[],
		toolPermissions: [] as IToolPermission[],
	};

	return {
		...initialState,

		setThreads: (threads: IChatThread[]) =>
			set((draft) => { draft.threads = threads; }),
		setActiveThread: (id: TThreadId | null) =>
			set((draft) => { draft.activeThreadId = id; }),
		setMessages: (messages: IChatMessage[]) =>
			set((draft) => { draft.messages = messages; }),
		appendMessage: (message: IChatMessage) =>
			set((draft) => { draft.messages.push(message); }),
		setStreamStatus: (status: EStreamStatus) =>
			set((draft) => { draft.streamStatus = status; }),
		setStreamingText: (text: string) =>
			set((draft) => { draft.streamingText = text; }),
		setStreamingReasoning: (text: string) =>
			set((draft) => { draft.streamingReasoning = text; }),
		setToolCalls: (toolCalls: IToolCall[]) =>
			set((draft) => { draft.toolCalls = toolCalls; }),
		updateToolCall: (id: TToolCallId, updates: Partial<IToolCall>) =>
			set((draft) => {
				const idx = draft.toolCalls.findIndex((tc) => tc.id === id);
				if (idx >= 0) Object.assign(draft.toolCalls[idx]!, updates);
			}),
		setMcpServers: (servers: Record<string, IMcpServerState>) =>
			set((draft) => { draft.mcpServers = servers; }),
		setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) =>
			set((draft) => {
				draft.serverPermissions = serverPerms;
				draft.toolPermissions = toolPerms;
			}),
		reset: () =>
			set(() => ({ ...initialState })),
	};
}
