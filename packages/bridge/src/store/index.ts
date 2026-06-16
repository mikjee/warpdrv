// ============================================================
// warpbridge/src/store/index.ts
// Zustand store for frontend state management.
// Universal — browser + Node (Zustand works in both).
// Uses Immer pattern for mutable-like state updates.
// ============================================================

import type {
	IChatThread,
	IChatMessage,
	IToolCall,
	IToolAttachment,
	IMessagePatch,
	TThreadId,
	TMessageId,
	TMessagePartId,
	TToolCallId,
	TFolderId,
	IMcpServerState,
	IServerPermission,
	IToolPermission,
	IThreadToolPermission,
	IThreadPatch,
	IElicitationRequest,
} from '../types';
import { EMessagePartType } from '../types';
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
	// Threads - flat map keyed by thread ID
	threads: Record<TThreadId, IChatThread>;
	activeThreadId: TThreadId | null;

	// Messages - nested map: threadId -> messageId -> IChatMessage
	messagesByThread: Record<TThreadId, Record<TMessageId, IChatMessage>>;
	chunksByMessageId: Record<string, {
		partId: string,
		chunk: string,
		lastUpdate: Date,
	}>;

	// In-memory head tracking (NOT persisted to DB)
	// Updated automatically on message.created
	headMessageIdByThread: Record<TThreadId, TMessageId>;

	// Tool calls - global flat map (these are the records from conversations)
	toolCallsById: Record<TToolCallId, IToolCall>;
	startingToolsByMessage: Record<TMessageId, string[]>;

	// Inference state per thread
	isRunningByThread: Record<TThreadId, boolean>;

	// Last inference error (cleared after toast is shown)
	inferenceError: { threadId: TThreadId; messageId: TMessageId; error: string } | null;

	// Last embedding error (cleared after toast is shown)
	embeddingError: { error: string } | null;

	// Embedding status - messageIds that have embeddings for current selection
	embeddingStatusByMessage: Record<TMessageId, true>;
	setThreadEmbeddingStatuses: (messageIds: string[]) => void;
	applyEmbeddingEmbedded: (messageId: string) => void;
	removeEmbeddingStatus: (messageId: string) => void;
	clearEmbeddingStatuses: () => void;

	// MCP State
	mcpServers: Record<string, IMcpServerState>;
	serverPermissions: IServerPermission[];
	toolPermissions: IToolPermission[];
	threadToolPermissions: Record<TThreadId, IThreadToolPermission[]>;

	// Current chat state (for active thread context)
	currentThreadId: TThreadId | null;
	currentSystemPrompt: string;
	currentInferenceParams: Record<string, unknown>;
	tempThreadServerId: string | null;
	tempAutoEmbed: boolean;
	selectedWhisperServerId: string | null;

	// Attached tools (for active thread context)
	attachAllTools: boolean;
	attachedTools: IToolAttachment[];
	// Elicitations (per thread)
	elicitationByThread: Record<TThreadId, IElicitationRequest>;
	// Actions
	applyThreadCreated: (thread: IChatThread) => void;
	applyThreadUpdated: (threadId: TThreadId, updates: IThreadPatch) => void;
	applyThreadDeleted: (threadId: TThreadId) => void;
	applyMessageCreated: (message: IChatMessage) => void;
	applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) => void;
	applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) => void;
	applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) => void;
	applyToolCallStarting: (messageId: TMessageId, name: string) => void;
	applyToolCallCreated: (toolCall: IToolCall) => void;
	applyToolCallUpdated: (toolCall: IToolCall) => void;
	applyInferenceStarted: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) => void;
	applyInferenceError: (threadId: TThreadId, messageId: TMessageId, error: string) => void;
	applyEmbeddingError: (error: string) => void;
	applyElicitationRequest: (threadId: TThreadId, request: IElicitationRequest) => void;
	applyElicitationResolved: (id: string) => void;
	seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) => void;
	setThreads: (threads: Record<TThreadId, IChatThread>) => void;
	setActiveThread: (id: TThreadId | null) => void;
	setHeadMessageId: (threadId: TThreadId, messageId: TMessageId) => void;

	// Current chat state actions
	setCurrentThreadId: (id: TThreadId | null) => void;
	setCurrentSystemPrompt: (prompt: string) => void;
	setCurrentInferenceParams: (params: Record<string, unknown>) => void;
	setTempThreadServerId: (id: string | null) => void;
	setTempAutoEmbed: (v: boolean) => void;
	setSelectedWhisperServerId: (id: string | null) => void;

	// Attached tools actions
	setAttachedTools: (attachAll: boolean, tools: IToolAttachment[]) => void;

	// MCP Actions
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) => void;
	setThreadToolPermissions: (threadId: TThreadId, perms: IThreadToolPermission[]) => void;

	// Persisted states — free-form JSON blobs per entity
	workspaceStates: Record<TFolderId, Record<string, unknown>>;
	threadStates: Record<TThreadId, Record<string, unknown>>;
	messageStates: Record<TMessageId, Record<string, unknown>>;
	setWorkspaceState: (folderId: TFolderId, fn: (state: Record<string, unknown>) => void) => Record<string, unknown>;
	setThreadState: (threadId: TThreadId, fn: (state: Record<string, unknown>) => void) => Record<string, unknown>;
	setMessageState: (messageId: TMessageId, fn: (state: Record<string, unknown>) => void) => Record<string, unknown>;
	initWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => void;
	initThreadState: (threadId: TThreadId, data: Record<string, unknown>) => void;
	initMessageStates: (states: Array<{ messageId: TMessageId; data: Record<string, unknown> }>) => void;
	applyWorkspaceStateUpdated: (folderId: TFolderId, data: Record<string, unknown>) => void;
	applyThreadStateUpdated: (threadId: TThreadId, data: Record<string, unknown>) => void;
	applyMessageStateUpdated: (messageId: TMessageId, data: Record<string, unknown>) => void;

	reset: () => void;
}

// ============================================================
// Slice creator — for use with Zustand's slice pattern.
// Uses Immer for mutable-like updates. Compatible with WarpCore's store.
// Generic over state type to allow integration with superset types (e.g. AppState)
// ============================================================
export function createChatStoreSlice<TState extends IChatStoreState>(
	set: ImmerSet<TState>,
	_get: ImmerGet<TState>,
): IChatStoreState {
	const initialState = {
		threads: {} as Record<TThreadId, IChatThread>,
		startingToolsByMessage: {} as Record<TMessageId, string[]>,
		activeThreadId: null as TThreadId | null,
		messagesByThread: {} as Record<TThreadId, Record<TMessageId, IChatMessage>>,
		chunksByMessageId: {},
		headMessageIdByThread: {} as Record<TThreadId, TMessageId>,
		toolCallsById: {} as Record<TToolCallId, IToolCall>,
		isRunningByThread: {} as Record<TThreadId, boolean>,
		inferenceError: null,
		embeddingError: null,
		embeddingStatusByMessage: {} as Record<TMessageId, true>,
		mcpServers: {} as Record<string, IMcpServerState>,
		serverPermissions: [] as IServerPermission[],
		toolPermissions: [] as IToolPermission[],
		threadToolPermissions: {} as Record<TThreadId, IThreadToolPermission[]>,
		currentThreadId: null as TThreadId | null,
		currentSystemPrompt: '',
		currentInferenceParams: {} as Record<string, unknown>,
		tempThreadServerId: null,
		tempAutoEmbed: false,
		selectedWhisperServerId: null,
		attachAllTools: false,
		attachedTools: [] as IToolAttachment[],
		elicitationByThread: {} as Record<TThreadId, IElicitationRequest>,
		workspaceStates: {} as Record<TFolderId, Record<string, unknown>>,
		threadStates: {} as Record<TThreadId, Record<string, unknown>>,
		messageStates: {} as Record<TMessageId, Record<string, unknown>>,
	};

	return {
		...initialState,

		// Thread actions
		applyThreadCreated: (thread: IChatThread) =>
			set((draft) => {
				draft.threads[thread.id] = thread;
			}),

		applyThreadUpdated: (threadId: TThreadId, updates: IThreadPatch) =>
			set((draft) => {
				const thread = draft.threads[threadId];
				if (thread) {
					if (updates.title !== undefined) draft.threads[threadId]!.title = updates.title;
					if (updates.folderId !== undefined) draft.threads[threadId]!.folderId = updates.folderId;
					if (updates.systemPrompt !== undefined) draft.threads[threadId]!.systemPrompt = updates.systemPrompt;
					if (updates.meta !== undefined) draft.threads[threadId]!.meta = updates.meta;
					if (updates.totalPromptTokens !== undefined) draft.threads[threadId]!.totalPromptTokens = updates.totalPromptTokens;
					if (updates.totalCompletionTokens !== undefined) draft.threads[threadId]!.totalCompletionTokens = updates.totalCompletionTokens;
				}
			}),

		applyThreadDeleted: (threadId: TThreadId) =>
			set((draft) => {
				delete draft.threads[threadId];
				delete draft.headMessageIdByThread[threadId];
				delete draft.isRunningByThread[threadId];
				delete draft.elicitationByThread[threadId];
				delete draft.threadToolPermissions[threadId];
				delete draft.threadStates[threadId];
				// Clear embedding statuses and message states for messages in this thread
				const msgs = draft.messagesByThread[threadId];
				if (msgs) {
					for (const messageId of Object.keys(msgs)) {
						delete draft.embeddingStatusByMessage[messageId];
						delete draft.messageStates[messageId];
					}
				}
				delete draft.messagesByThread[threadId];
				// Clear current thread if it was the deleted one
				if (draft.currentThreadId === threadId) {
					draft.currentThreadId = null;
				}
			}),

		// Message actions
		applyMessageCreated: (message: IChatMessage) =>
			set((draft) => {
				// Ensure thread exists in messagesByThread
				if (!draft.messagesByThread[message.threadId]) {
					draft.messagesByThread[message.threadId] = {};
				}
				const threadMessages = draft.messagesByThread[message.threadId]!;
				// Insert message
				threadMessages[message.id] = message;
				// Update head — new message is always the new head
				draft.headMessageIdByThread[message.threadId] = message.id;
			}),

		applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;

				// Flush and remove chunks
				const buffer = draft.chunksByMessageId[msg.id];
				if (buffer && buffer.chunk.length > 0) {
					const part = msg.content.find(p => p.id === buffer.partId);
					if (part && (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING)) {
						part.text += buffer.chunk;
					} else {
					}
				}
				delete draft.chunksByMessageId[msg.id];

				// Update stats if provided
				if (updates.stats !== undefined) {
					msg.stats = updates.stats;
				}

				// Handle replaceParts — full replacement
				if (updates.replaceParts !== undefined) {
					msg.content = [...updates.replaceParts];
					return;
				}

				// Handle addParts — upsert by part id
				if (updates.addParts !== undefined) {
					for (const part of updates.addParts) {
						const existingIndex = msg.content.findIndex(p => p.id === part.id);
						if (existingIndex >= 0) {
							// Replace existing part
							draft.messagesByThread[threadId]![messageId]!.content[existingIndex]! = part;
						} else {
							// Add new part
							msg.content.push(part);
						}
					}
				}
			}),

		applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;
				
				// Handle head shift if deleted message is the head
				if (draft.headMessageIdByThread[threadId] === messageId) {
					const threadMessages = draft.messagesByThread[threadId] ?? {};
					const parentId = msg.parentId;
					
					// Find most recent sibling
					let newHead: TMessageId | null = null;
					let newestCreatedAt = -1;
					
					for (const sibling of Object.values(threadMessages)) {
						if (sibling.id !== messageId && sibling.parentId === parentId) {
							if (sibling.createdAt > newestCreatedAt) {
								newestCreatedAt = sibling.createdAt;
								newHead = sibling.id;
							}
						}
					}
					
					// Fallback to parent if no siblings
					// root msgs cannot beleted so it will always have a parent ID or not get deleted.
					if (newHead === null) newHead = parentId!;					
					draft.headMessageIdByThread[threadId] = newHead;
				}
				
				const grandParentId = msg.parentId;
				
				for (const child of Object.values(draft.messagesByThread[threadId] ?? {})) {
					if (child.parentId === messageId) {
						child.parentId = grandParentId as TMessageId | null;
					}
				}
				
				delete draft.messagesByThread[threadId]?.[messageId];
				delete draft.messageStates[messageId];
			}),

		applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) =>
			set((draft) => {
				const msg = draft.messagesByThread[threadId]?.[messageId];
				if (!msg) return;

				const buffer = draft.chunksByMessageId[messageId];
				const now = Date.now();
				const part = msg.content.find(p => p.id === partId);

				// Helper to flush buffer to part (creates part if needed)
				const flushBuffer = (buf: { partId: string; chunk: string }) => {
					const existingPart = msg.content.find(p => p.id === buf.partId);
					if (existingPart && (existingPart.type === EMessagePartType.TEXT || existingPart.type === EMessagePartType.REASONING)) {
						existingPart.text += buf.chunk;
					} else {
						const newPart = {
							id: buf.partId,
							type: EMessagePartType.TEXT,
							orderIndex: msg.content.length,
							text: buf.chunk,
						} as any;
						msg.content.push(newPart);
					}
				};

				// Helper to create part if it doesn't exist
				const ensurePartExists = () => {
					if (!part) {
						const newPart = {
							id: partId,
							type: EMessagePartType.TEXT,
							orderIndex: msg.content.length,
							text: deltaText,
						} as any;
						msg.content.push(newPart);
					} else {
						if (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING) {
							part.text += deltaText;
						}
					}
				};

				// No existing buffer - first chunk for this message
				if (!buffer) {
					ensurePartExists();
					// Create empty buffer for future chunks
					draft.chunksByMessageId[messageId] = {
						partId,
						chunk: '',
						lastUpdate: new Date(now),
					};
					return;
				}

				// Buffer exists - check if partId changed
				if (buffer.partId !== partId) {
					// Flush old buffer to its part
					flushBuffer(buffer);
					// Handle new part
					ensurePartExists();
					// Create empty buffer for new part
					draft.chunksByMessageId[messageId] = {
						partId,
						chunk: '',
						lastUpdate: new Date(now),
					};
					return;
				}

				// Same partId - check time delta
				const timeDelta = now - buffer.lastUpdate.getTime();
				if (timeDelta <= 100) {
					// Within 100ms - append to buffer
					buffer.chunk += deltaText;
				} else {
					// Over 100ms - flush buffer and append new delta
					flushBuffer(buffer);
					// Append new delta directly to part
					if (part && (part.type === EMessagePartType.TEXT || part.type === EMessagePartType.REASONING)) {
						part.text += deltaText;
					}
					// Reset buffer
					buffer.chunk = '';
					buffer.lastUpdate = new Date(now);
				}
			}),

		// Tool call actions
		applyToolCallStarting: (messageId: TMessageId, name: string) =>
			set((draft) => {
				if (!draft.startingToolsByMessage[messageId]) {
					draft.startingToolsByMessage[messageId] = [];
				}
				draft.startingToolsByMessage[messageId]!.push(name);
			}),
		applyToolCallCreated: (toolCall: IToolCall) =>
			set((draft) => {
				draft.toolCallsById[toolCall.id] = toolCall;
			}),

		applyToolCallUpdated: (toolCall: IToolCall) =>
			set((draft) => {
				if (draft.toolCallsById[toolCall.id]) {
					Object.assign(draft.toolCallsById[toolCall.id]!, toolCall);
				}
			}),

		// Inference state actions
		applyInferenceStarted: (threadId: TThreadId, _messageId: TMessageId) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = true;
			}),

		applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = false;
				delete draft.startingToolsByMessage[messageId];
			}),

	applyInferenceError: (threadId: TThreadId, messageId: TMessageId, error: string) =>
			set((draft) => {
				draft.isRunningByThread[threadId] = false;
				draft.inferenceError = { threadId, messageId, error };
				delete draft.startingToolsByMessage[messageId];
			}),
		applyEmbeddingError: (error: string) =>
			set((draft) => {
				draft.embeddingError = { error };
			}),
		setThreadEmbeddingStatuses: (messageIds: string[]) =>
			set((draft) => {
				draft.embeddingStatusByMessage = {};
				for (const id of messageIds) {
					draft.embeddingStatusByMessage[id] = true;
				}
			}),
		applyEmbeddingEmbedded: (messageId: string) =>
			set((draft) => {
				draft.embeddingStatusByMessage[messageId] = true;
			}),
		removeEmbeddingStatus: (messageId: string) =>
			set((draft) => {
				delete draft.embeddingStatusByMessage[messageId];
			}),
		clearEmbeddingStatuses: () =>
			set((draft) => {
				draft.embeddingStatusByMessage = {};
			}),
		applyElicitationRequest: (threadId: TThreadId, request: IElicitationRequest) =>
			set((draft) => {
				draft.elicitationByThread[threadId] = request;
			}),
		applyElicitationResolved: (id: string) =>
			set((draft) => {
				for (const [tid, e] of Object.entries(draft.elicitationByThread)) {
					if (e.id === id) delete draft.elicitationByThread[tid];
				}
			}),
		// Initial seeding from API fetch
		seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) =>
			set((draft) => {
				// Ensure thread map exists
				if (!draft.messagesByThread[threadId]) {
					draft.messagesByThread[threadId] = {};
				}

				// Bulk insert all messages
				for (const msg of messages) {
					draft.messagesByThread[threadId]![msg.id] = msg;
				}

				// Calculate initial head: newest by createdAt, tie-break by id
				if (messages.length > 0) {
					let headMsg = messages[0]!;
					for (let i = 1; i < messages.length; i++) {
						const candidate = messages[i]!;
						if (candidate.createdAt > headMsg.createdAt ||
							(candidate.createdAt === headMsg.createdAt && candidate.id > headMsg.id)) {
							headMsg = candidate;
						}
					}
					draft.headMessageIdByThread[threadId] = headMsg.id;
				}
			}),

		// Thread selection
		setThreads: (threads: Record<TThreadId, IChatThread>) =>
			set((draft) => {
				draft.threads = threads;
			}),

setActiveThread: (id: TThreadId | null) =>
		set((draft) => {
			draft.activeThreadId = id;
		}),

		setHeadMessageId: (threadId: TThreadId, messageId: TMessageId) =>
			set((draft) => {
				draft.headMessageIdByThread[threadId] = messageId;
			}),

		// Current chat state actions
		setCurrentThreadId: (id: TThreadId | null) =>
			set((draft) => {
				draft.currentThreadId = id;
				draft.tempThreadServerId = null;
				draft.tempAutoEmbed = false;
			}),

		setCurrentSystemPrompt: (prompt: string) =>
			set((draft) => {
				draft.currentSystemPrompt = prompt;
			}),

		setCurrentInferenceParams: (params: Record<string, unknown>) =>
			set((draft) => {
				draft.currentInferenceParams = params;
			}),

		setTempThreadServerId: (id: string | null) =>
			set((draft) => {
				draft.tempThreadServerId = id;
			}),

		setTempAutoEmbed: (v: boolean) =>
			set((draft) => {
				draft.tempAutoEmbed = v;
			}),

		setSelectedWhisperServerId: (id: string | null) =>
			set((draft) => {
				draft.selectedWhisperServerId = id;
			}),

		// Attached tools actions
		setAttachedTools: (attachAll: boolean, tools: IToolAttachment[]) =>
			set((draft) => {
				draft.attachAllTools = attachAll;
				draft.attachedTools = tools;
			}),

		// MCP Actions
		setMcpServers: (servers: Record<string, IMcpServerState>) =>
			set((draft) => {
				draft.mcpServers = servers;
			}),

		setPermissions: (serverPerms: IServerPermission[], toolPerms: IToolPermission[]) =>
			set((draft) => {
				draft.serverPermissions = serverPerms;
				draft.toolPermissions = toolPerms;
			}),

		setThreadToolPermissions: (threadId: TThreadId, perms: IThreadToolPermission[]) =>
			set((draft) => {
				draft.threadToolPermissions[threadId] = perms;
			}),

		// Persisted state actions
		setWorkspaceState: (folderId: TFolderId, fn: (state: Record<string, unknown>) => void) => {
			let result: Record<string, unknown> = {};
			set((draft) => {
				if (!draft.workspaceStates[folderId]) draft.workspaceStates[folderId] = {};
				fn(draft.workspaceStates[folderId]);
				result = draft.workspaceStates[folderId];
			});
			return result;
		},
		setThreadState: (threadId: TThreadId, fn: (state: Record<string, unknown>) => void) => {
			let result: Record<string, unknown> = {};
			set((draft) => {
				if (!draft.threadStates[threadId]) draft.threadStates[threadId] = {};
				fn(draft.threadStates[threadId]);
				result = draft.threadStates[threadId];
			});
			return result;
		},
		setMessageState: (messageId: TMessageId, fn: (state: Record<string, unknown>) => void) => {
			let result: Record<string, unknown> = {};
			set((draft) => {
				if (!draft.messageStates[messageId]) draft.messageStates[messageId] = {};
				fn(draft.messageStates[messageId]);
				result = draft.messageStates[messageId];
			});
			return result;
		},
		initWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.workspaceStates[folderId] = data;
			}),
		initThreadState: (threadId: TThreadId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.threadStates[threadId] = data;
			}),
		initMessageStates: (states: Array<{ messageId: TMessageId; data: Record<string, unknown> }>) =>
			set((draft) => {
				for (const { messageId, data } of states) {
					draft.messageStates[messageId] = data;
				}
			}),
		applyWorkspaceStateUpdated: (folderId: TFolderId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.workspaceStates[folderId] = data;
			}),
		applyThreadStateUpdated: (threadId: TThreadId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.threadStates[threadId] = data;
			}),
		applyMessageStateUpdated: (messageId: TMessageId, data: Record<string, unknown>) =>
			set((draft) => {
				draft.messageStates[messageId] = data;
			}),

		// Reset
		reset: () =>
			set(() => ({ ...initialState })),
	};
}
