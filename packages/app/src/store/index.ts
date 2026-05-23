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
import { whisperBackendsSlice } from './slices/whisperBackends';
import { whisperServersSlice } from './slices/whisperServers';
import { modelsSlice } from './slices/models';
import { settingsSlice } from './slices/settings';
import { proxySlice } from './slices/proxy';
import { recipesSlice } from './slices/recipes';
import { checkpointsSlice } from './slices/checkpoints';
import { hardwareSlice } from './slices/hardware';
import { releasesSlice } from './slices/releases';
import { kokoroSlice } from './slices/kokoro';
import { ttsSlice } from './slices/tts';
import { createChatStoreSlice } from '@warpcore/bridge/client';
import { DiffRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/DiffRenderer';
import { BashRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/BashRenderer';
import { FetchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/FetchRenderer';
import { ListRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/ListRenderer';
import { ReadFileRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/ReadFileRenderer';
import { SearchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/SearchRenderer';

export const useStore = create<AppState>()(
	subscribeWithSelector(
		immer((set: ImmerSet<AppState>, get: ImmerGet<AppState>): AppState => {
			const sseConnection = sseConnectionSlice(set, get);
				const servers = serversSlice(set, get);
				const downloads = downloadsSlice(set, get);
				const devices = devicesSlice(set, get);
				const backends = backendsSlice(set, get);
			const whisperBackends = whisperBackendsSlice(set, get);
			const whisperServers = whisperServersSlice(set, get);
				const models = modelsSlice(set, get);
				const settings = settingsSlice(set, get);
				const proxy = proxySlice(set, get);
				const recipes = recipesSlice(set, get);
				const checkpoints = checkpointsSlice(set, get);
				const hardware = hardwareSlice(set, get);
				const releases = releasesSlice(set, get);
				const kokoro = kokoroSlice(set, get);
			const tts = ttsSlice(set, get);
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
				whisperBackends: whisperBackends.whisperBackends!,
				whisperServers: whisperServers.whisperServers!,
				whisperServerLogs: whisperServers.whisperServerLogs!,
				tempThreadWhisperServerId: bridge.tempThreadWhisperServerId,
				setTempThreadWhisperServerId: bridge.setTempThreadWhisperServerId,
					models: models.models!,
					settings: settings.settings!,
					hardware: hardware.hardware!,
					llamaReleases: releases.llamaReleases!,
					whisperReleases: releases.whisperReleases!,
kokoroStatus: kokoro.kokoroStatus!,
					setKokoroStatus: kokoro.setKokoroStatus!,
ttsActiveMessageId: tts.ttsActiveMessageId!,
				ttsIsGenerating: tts.ttsIsGenerating!,
				ttsIsSpeaking: tts.ttsIsSpeaking!,
				ttsSpokenByMessage: tts.ttsSpokenByMessage!,
				ttsStart: tts.ttsStart!,
				ttsStop: tts.ttsStop!,
				ttsSetGenerating: tts.ttsSetGenerating!,
				ttsSetSpeaking: tts.ttsSetSpeaking!,
				ttsSetSpokenIndex: tts.ttsSetSpokenIndex!,
				ttsClearSpokenIndex: tts.ttsClearSpokenIndex!,
  					proxyStatus: proxy.proxyStatus!,
					proxyRoutes: proxy.proxyRoutes!,
					recipes: recipes.recipes!,
					activeRun: recipes.activeRun!,
					stepOutputs: recipes.stepOutputs!,
					checkpoints: checkpoints.checkpoints!,
					SSEHandlers: sseHandlers.SSEHandlers!,
					elicitationByThread: bridge.elicitationByThread,
					applyElicitationRequest: bridge.applyElicitationRequest,
					applyElicitationResolved: bridge.applyElicitationResolved,

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
				toolCallRenderers: {
						DiffRenderer: DiffRendererMeta,
						BashRenderer: BashRendererMeta,
						FetchRenderer: FetchRendererMeta,
						ListRenderer: ListRendererMeta,
						ReadFileRenderer: ReadFileRendererMeta,
						SearchRenderer: SearchRendererMeta,
					},
					registerToolCallRenderer: (name, component) => set((state) => {
						state.toolCallRenderers[name] = component;
					}),

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
