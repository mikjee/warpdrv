import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppState, ImmerSet, ImmerGet } from './types';
import type { TFolderId, IWorkspace, TThreadId } from '@warpcore/bridge';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
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
import { annotationsSlice } from './slices/annotations';
import { chatPresetsSlice } from './slices/chatPresets';
import { embeddingSlice } from './slices/embedding';
import { chatSidebarSlice } from './slices/chatSidebar';
import { slashCommandsSlice } from './slices/slashCommands';
import { uiSpacesSlice } from './slices/uiSpaces';
import { createChatStoreSlice, type TMessageId } from '@warpcore/bridge/client';
import { updateWorkspaceState, updateThreadState, updateMessageState } from '@/api/services';
import { DiffRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/DiffRenderer';
import { BashRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/BashRenderer';
import { FetchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/FetchRenderer';
import { ListRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/ListRenderer';
import { ReadFileRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/ReadFileRenderer';
import { SearchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/SearchRenderer';
import { TodoItemRendererMeta, TodoListRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/TodoRenderer';
import { CodeGraphIngestRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphIngestRenderer';
import { CodeGraphSearchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphSearchRenderer';
import { CodeGraphSymbolRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphSymbolRenderer';
import { CodeGraphCallersRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphCallersRenderer';
import { CodeGraphCalleesRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphCalleesRenderer';
import { CodeGraphListRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphListRenderer';
import { CodeGraphClearRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/CodeGraphClearRenderer';
import { RgRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/RgRenderer';
import { EmbeddingSearchRendererMeta } from '@/pages/Chat/assistant-ui/tool-renderers/EmbeddingSearchRenderer';

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
			const annotations = annotationsSlice(set, get);
			const chatPresets = chatPresetsSlice(set, get);
			const embedding = embeddingSlice(set, get);
				const chatSidebar = chatSidebarSlice(set, get);
				const slashCommands = slashCommandsSlice(set, get);
			const uiSpaces = uiSpacesSlice(set, get);
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
					selectedWhisperServerId: bridge.selectedWhisperServerId,
					setSelectedWhisperServerId: bridge.setSelectedWhisperServerId,
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
					ttsVadSentencesSent: tts.ttsVadSentencesSent!,
					ttsVadSentencesDone: tts.ttsVadSentencesDone!,
					ttsVadRequestId: tts.ttsVadRequestId!,
					ttsStart: tts.ttsStart!,
					ttsStop: tts.ttsStop!,
					ttsSetGenerating: tts.ttsSetGenerating!,
					ttsSetSpeaking: tts.ttsSetSpeaking!,
					ttsSetActiveMessageId: tts.ttsSetActiveMessageId!,
					ttsSetSpokenIndex: tts.ttsSetSpokenIndex!,
					ttsClearSpokenIndex: tts.ttsClearSpokenIndex!,
					ttsVadIncSent: tts.ttsVadIncSent!,
					ttsVadIncDone: tts.ttsVadIncDone!,
					ttsVadReset: tts.ttsVadReset!,
					vadActive: tts.vadActive!,
					setVadActive: tts.setVadActive!,
					ttsVadNewRequestId: tts.ttsVadNewRequestId!,
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
					inferenceError: bridge.inferenceError,
					embeddingStatusByMessage: bridge.embeddingStatusByMessage,

					// Bridge MCP State
					mcpServers: bridge.mcpServers,
					serverPermissions: bridge.serverPermissions,
					toolPermissions: bridge.toolPermissions,
					threadToolPermissions: bridge.threadToolPermissions,
					setMcpServers: bridge.setMcpServers,
					setPermissions: bridge.setPermissions,
					setThreadToolPermissions: bridge.setThreadToolPermissions,
					toolCallRenderers: {
						DiffRenderer: DiffRendererMeta,
						BashRenderer: BashRendererMeta,
						FetchRenderer: FetchRendererMeta,
						ListRenderer: ListRendererMeta,
						ReadFileRenderer: ReadFileRendererMeta,
						CodeGraphSearchRenderer: CodeGraphSearchRendererMeta,
						SearchRenderer: SearchRendererMeta,
						TodoItemRenderer: TodoItemRendererMeta,
						TodoListRenderer: TodoListRendererMeta,
						CodeGraphIngestRenderer: CodeGraphIngestRendererMeta,
						CodeGraphSymbolRenderer: CodeGraphSymbolRendererMeta,
						CodeGraphCallersRenderer: CodeGraphCallersRendererMeta,
						CodeGraphCalleesRenderer: CodeGraphCalleesRendererMeta,
						CodeGraphListRenderer: CodeGraphListRendererMeta,
						CodeGraphClearRenderer: CodeGraphClearRendererMeta,
						RgRenderer: RgRendererMeta,
						EmbeddingSearchRenderer: EmbeddingSearchRendererMeta,
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
					applyEmbeddingError: bridge.applyEmbeddingError,
					setThreadEmbeddingStatuses: bridge.setThreadEmbeddingStatuses,
					applyEmbeddingEmbedded: bridge.applyEmbeddingEmbedded,
					removeEmbeddingStatus: bridge.removeEmbeddingStatus,
					clearEmbeddingStatuses: bridge.clearEmbeddingStatuses,
					seedThreadMessages: bridge.seedThreadMessages,
					setThreads: bridge.setThreads,
					setHeadMessageId: bridge.setHeadMessageId,

					// Current chat state
					currentThreadId: bridge.currentThreadId,
					currentSystemPrompt: bridge.currentSystemPrompt,
					currentInferenceParams: bridge.currentInferenceParams,
					setCurrentThreadId: (id: TThreadId | null) => {
						const state = get();
						const current = state.currentThreadId;
						const switching = current != null && id !== current;
						//console.log('[Store] setCurrentThreadId:', id, 'current=', current, 'switching=', switching);
						bridge.setCurrentThreadId(id);
						if (switching) {
							//console.log('[Store] thread switch detected, setting vadActive=false');
							tts.setVadActive!(false);
						}
						annotations.clearAnnotations!();
						annotations.setAnnotatorVisible!(false);
						if (id && state.threads[id]) {
							// Thread exists in store — derive workspace from its folderId
							if (state.threads[id]!.folderId) {
								set(s => { s.activeWorkspaceId = state.threads[id]!.folderId; });
							} else {
								set(s => { s.activeWorkspaceId = null; });
							}
						}
						// If thread doesn't exist (new/fresh thread), preserve activeWorkspaceId as-is
					},
					setCurrentSystemPrompt: bridge.setCurrentSystemPrompt,
					setCurrentInferenceParams: bridge.setCurrentInferenceParams,
					tempThreadServerId: bridge.tempThreadServerId,
					setTempThreadServerId: bridge.setTempThreadServerId,
					tempAutoEmbed: bridge.tempAutoEmbed,
					setTempAutoEmbed: bridge.setTempAutoEmbed,
					tempThreadState: bridge.tempThreadState,

					// Attached tools
					attachAllTools: bridge.attachAllTools,
					attachedTools: bridge.attachedTools,
					setAttachedTools: bridge.setAttachedTools,

// Chat Presets
			chatPresets: chatPresets.chatPresets!,
			setChatPresets: chatPresets.setChatPresets!,
			addChatPreset: chatPresets.addChatPreset!,
			removeChatPreset: chatPresets.removeChatPreset!,

		// Chat Folders
				folders: [],
				setFolders: (folders) => set(s => { s.folders = folders; }),

				// Workspaces
				activeWorkspaceId: null,
				setActiveWorkspaceId: (id: TFolderId | null) => set(s => { s.activeWorkspaceId = id; }),
				workspaces: {},
				setWorkspace: (workspace: IWorkspace) => set(s => { s.workspaces[workspace.folderId] = workspace; }),

				// Persisted states
				workspaceStates: bridge.workspaceStates,
				threadStates: bridge.threadStates,
				messageStates: bridge.messageStates,
				setWorkspaceState: (folderId: TFolderId, data: Record<string, unknown>) => {
					bridge.setWorkspaceState(folderId, data);
					updateWorkspaceState(folderId, data);
				},
				getCurrentThreadState: bridge.getCurrentThreadState,
				setThreadState: (threadId: TThreadId | null, data: Record<string, unknown>) => {
					bridge.setThreadState(threadId, data);
					if (threadId) {
						updateThreadState(threadId, data);
					}
				},
				setMessageState: (messageId: TMessageId, data: Record<string, unknown>) => {
					bridge.setMessageState(messageId, data);
					updateMessageState(messageId, data);
				},
				initWorkspaceState: bridge.initWorkspaceState,
				initThreadState: bridge.initThreadState,
				initMessageStates: bridge.initMessageStates,
				applyWorkspaceStateUpdated: bridge.applyWorkspaceStateUpdated,
				applyThreadStateUpdated: bridge.applyThreadStateUpdated,
				applyMessageStateUpdated: bridge.applyMessageStateUpdated,
				setUiSpaceComponentProps: uiSpaces.setUiSpaceComponentProps!,

				// Annotations
					annotations: annotations.annotations!,
					annotatorVisible: annotations.annotatorVisible!,
					addAnnotation: annotations.addAnnotation!,
					removeAnnotation: annotations.removeAnnotation!,
					clearAnnotations: annotations.clearAnnotations!,
					setAnnotatorVisible: annotations.setAnnotatorVisible!,

					// Embedding
					selectedEmbeddingServerId: embedding.selectedEmbeddingServerId!,
					setSelectedEmbeddingServerId: embedding.setSelectedEmbeddingServerId!,

					// Chat sidebar state
					chatSidebarOpen: chatSidebar.chatSidebarOpen!,
					chatSidebarTab: chatSidebar.chatSidebarTab!,
					setChatSidebarOpen: chatSidebar.setChatSidebarOpen!,
					setChatSidebarTab: chatSidebar.setChatSidebarTab!,
					openChatSidebarTab: chatSidebar.openChatSidebarTab!,

// Slash commands
			slashCommands: slashCommands.slashCommands!,
			slashCommandsByApplet: slashCommands.slashCommandsByApplet!,
			registerSlashCommand: slashCommands.registerSlashCommand!,
			unregisterSlashCommand: slashCommands.unregisterSlashCommand!,

	// UI Spaces
			uiSpaceComponentsById: uiSpaces.uiSpaceComponentsById!,
			uiSpaceComponentsByLocation: uiSpaces.uiSpaceComponentsByLocation!,
			uiSpaceComponentsByApplet: uiSpaces.uiSpaceComponentsByApplet!,
			registerUiSpaceComponent: uiSpaces.registerUiSpaceComponent!,
			unregisterUiSpaceComponent: uiSpaces.unregisterUiSpaceComponent!,

			// Pending slash commands
			pendingSlashCommands: [] as IExtractedSlashCommand[],
			setPendingSlashCommands: (commands: IExtractedSlashCommand[]) => set(s => { s.pendingSlashCommands = commands; }),
			clearPendingSlashCommands: () => set(s => { s.pendingSlashCommands = []; }),
			};
		}),
	),
);
