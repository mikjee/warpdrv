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
import { modelsSlice } from './slices/models';
import { settingsSlice } from './slices/settings';
import { proxySlice } from './slices/proxy';
import { recipesSlice } from './slices/recipes';
import { checkpointsSlice } from './slices/checkpoints';
import { createChatStoreSlice } from '@warpcore/bridge/client';

export const useStore = create<AppState>()(
	subscribeWithSelector(
		immer((set: ImmerSet<AppState>, get: ImmerGet<AppState>): AppState => {
			const sseConnection = sseConnectionSlice(set, get);
				const servers = serversSlice(set, get);
				const downloads = downloadsSlice(set, get);
				const devices = devicesSlice(set, get);
				const backends = backendsSlice(set, get);
				const models = modelsSlice(set, get);
				const settings = settingsSlice(set, get);
				const proxy = proxySlice(set, get);
				const recipes = recipesSlice(set, get);
				const checkpoints = checkpointsSlice(set, get);
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
					serverSlots: servers.serverSlots!,
					downloads: downloads.downloads!,
					devices: devices.devices!,
					backends: backends.backends!,
					backendGroups: backends.backendGroups!,
					models: models.models!,
					settings: settings.settings!,
 					proxyStatus: proxy.proxyStatus!,
					proxyRoutes: proxy.proxyRoutes!,
					recipes: recipes.recipes!,
					activeRun: recipes.activeRun!,
					stepOutputs: recipes.stepOutputs!,
					checkpoints: checkpoints.checkpoints!,
					SSEHandlers: sseHandlers.SSEHandlers!,

					// Bridge Chat State
					threads: bridge.threads,
					messagesByThread: bridge.messagesByThread,
					chunksByMessageId: bridge.chunksByMessageId,

					headMessageIdByThread: bridge.headMessageIdByThread,
					toolCallsById: bridge.toolCallsById,
					startingToolsByMessage: bridge.startingToolsByMessage,
					isRunningByThread: bridge.isRunningByThread,
					activeThreadId: bridge.activeThreadId,
					inferenceError: bridge.inferenceError,

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
					applyToolCallStarting: bridge.applyToolCallStarting,
					applyToolCallCreated: bridge.applyToolCallCreated,
					applyToolCallUpdated: bridge.applyToolCallUpdated,
					applyInferenceStarted: bridge.applyInferenceStarted,
					applyInferenceEnded: bridge.applyInferenceEnded,
					applyInferenceError: bridge.applyInferenceError,
					seedThreadMessages: bridge.seedThreadMessages,
					setThreads: bridge.setThreads,
					setActiveThread: bridge.setActiveThread,
					setHeadMessageId: bridge.setHeadMessageId,

					// Current chat state
					currentThreadId: bridge.currentThreadId,
					currentSystemPrompt: bridge.currentSystemPrompt,
					currentInferenceParams: bridge.currentInferenceParams,
					setCurrentThreadId: bridge.setCurrentThreadId,
					setCurrentSystemPrompt: bridge.setCurrentSystemPrompt,
					setCurrentInferenceParams: bridge.setCurrentInferenceParams,
					tempThreadServerId: bridge.tempThreadServerId,
					setTempThreadServerId: bridge.setTempThreadServerId,

					// Attached tools
					attachAllTools: bridge.attachAllTools,
					attachedTools: bridge.attachedTools,
					setAttachedTools: bridge.setAttachedTools,

					// Chat Folders
					folders: [],
					setFolders: (folders) => set(s => { s.folders = folders; }),
				};
		}),
	),
);
