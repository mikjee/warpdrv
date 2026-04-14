import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppState, ImmerSet, ImmerGet } from './types';
import { sseConnectionSlice } from './slices/sseConnection';
import { sseHandlersSlice } from './slices/sseHandlers';
import { serversSlice } from './slices/servers';
import { downloadsSlice } from './slices/downloads';
import { devicesSlice } from './slices/devices';
import { backendsSlice } from './slices/backends';
import { proxySlice } from './slices/proxy';
import { createChatStoreSlice } from '@warpcore/bridge/client';

export const useStore = create<AppState>()(
	subscribeWithSelector(
		immer((set: ImmerSet<AppState>, get: ImmerGet<AppState>): AppState => {
			const sseConnection = sseConnectionSlice(set, get);
				const servers = serversSlice(set, get);
				const downloads = downloadsSlice(set, get);
				const devices = devicesSlice(set, get);
				const backends = backendsSlice(set, get);
				const proxy = proxySlice(set, get);
				const sseHandlers = sseHandlersSlice(set, get);
				const bridge = createChatStoreSlice(set, get);

				return {
					// Existing fields
					sseConnected: sseConnection.sseConnected!,
					setSseConnected: sseConnection.setSseConnected!,
					testData: sseConnection.testData!,
					servers: servers.servers!,
					serverStats: servers.serverStats!,
					serverLogs: servers.serverLogs!,
					downloads: downloads.downloads!,
					devices: devices.devices!,
					backends: backends.backends!,
					backendGroups: backends.backendGroups!,
					proxyStatus: proxy.proxyStatus!,
					proxyRoutes: proxy.proxyRoutes!,
					SSEHandlers: sseHandlers.SSEHandlers!,

					// Bridge Chat State
					threads: bridge.threads,
					messagesByThread: bridge.messagesByThread,
					chunksByMessageId: bridge.chunksByMessageId,

					headMessageIdByThread: bridge.headMessageIdByThread,
					toolCallsById: bridge.toolCallsById,
					isRunningByThread: bridge.isRunningByThread,
					activeThreadId: bridge.activeThreadId,

					// Bridge MCP State
					mcpServers: bridge.mcpServers,
					serverPermissions: bridge.serverPermissions,
					toolPermissions: bridge.toolPermissions,
					setMcpServers: bridge.setMcpServers,
					setPermissions: bridge.setPermissions,

					reset: bridge.reset,

					// Bridge Actions
					applyThreadCreated: bridge.applyThreadCreated,
					applyThreadUpdated: bridge.applyThreadUpdated,
					applyThreadDeleted: bridge.applyThreadDeleted,
					applyMessageCreated: bridge.applyMessageCreated,
					applyMessagePatched: bridge.applyMessagePatched,
					applyMessageDeleted: bridge.applyMessageDeleted,
					applyMessageChunk: bridge.applyMessageChunk,
					applyToolCallCreated: bridge.applyToolCallCreated,
					applyToolCallUpdated: bridge.applyToolCallUpdated,
					applyInferenceStarted: bridge.applyInferenceStarted,
					applyInferenceEnded: bridge.applyInferenceEnded,
					seedThreadMessages: bridge.seedThreadMessages,
					setThreads: bridge.setThreads,
					setActiveThread: bridge.setActiveThread,
					setHeadMessageId: bridge.setHeadMessageId,

					// Current chat state
					currentThreadId: bridge.currentThreadId,
					currentServerId: bridge.currentServerId,
					currentSystemPrompt: bridge.currentSystemPrompt,
					currentInferenceParams: bridge.currentInferenceParams,
					setCurrentThreadId: bridge.setCurrentThreadId,
					setCurrentServerId: bridge.setCurrentServerId,
					setCurrentSystemPrompt: bridge.setCurrentSystemPrompt,
					setCurrentInferenceParams: bridge.setCurrentInferenceParams,
				};
		}),
	),
);
