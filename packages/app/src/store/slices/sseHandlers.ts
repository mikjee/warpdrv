import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, TBackendId, IBackend, TBackendGroupId, IBackendGroup, TRecipeId, IRecipe, IRecipeRunState, IRecipesInitPayload, IRunsStepStartedPayload, IRunsStepOutputPayload, IRunsStepFinishedPayload, IRunsFinishedPayload, ERecipeStreamKind, ISseSlotStatePayload, ISseServerSlotsSnapshotPayload, IServerSlotsState, ISseCheckpointPayload, ISseCheckpointDeletedPayload, ICheckpoint, TCheckpointId } from '@warpcore/shared';
import { ERecipeStepStatus, EServerStatus } from '@warpcore/shared';

interface SSEHandlersSlice {
	SSEHandlers: Record<string, (data: any) => void>;
}

export const sseHandlersSlice = (
	setState: ImmerSet<AppState>,
	getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	SSEHandlers: {
		// Phase 0.5 test handler
		test: (data) => setState((state) => { state.testData = data; }),

		// Phase 1: Servers
		'servers:list': (data) => setState((state) => { state.servers = data; }),
		'servers:update': (data: Record<TServerId, IServer>) => setState((state) => {
			for (const [id, server] of Object.entries(data)) {
				state.servers[id] = server;
				// Clear slot state when server stops
				if (server.status === EServerStatus.STOPPED) {
					delete state.serverSlots[id];
				}
			}
		}),
		'servers:delete': (data: Record<TServerId, null>) => setState((state) => {
			for (const id of Object.keys(data)) {
				delete state.servers[id];
			}
		}),
		'servers:stats': (data: Record<TServerId, IServerStats>) => {
			if (data && Object.keys(data).length > 0) {
				setState((state) => {
					for (const [id, stats] of Object.entries(data)) {
						state.serverStats[id] = stats;
					}
				});
			}
		},
		'servers:logs': (data: Record<string, string[]>) => setState((state) => {
			for (const [serverId, lines] of Object.entries(data)) {
				const logs = state.serverLogs[serverId] || [];
				const appended = [...logs, ...lines];
				state.serverLogs[serverId] = appended.length > 500 ? appended.slice(-500) : appended;
			}
		}),
		'slot:state': (data: ISseSlotStatePayload) => setState((state) => {
			const existing = state.serverSlots[data.serverId];
			if (!existing) {
				state.serverSlots[data.serverId] = { serverId: data.serverId, slots: [data.state], metadata: {} };
				return;
			}
			const idx = existing.slots.findIndex(s => s.slotId === data.state.slotId);
			if (idx >= 0) existing.slots[idx] = data.state;
			else existing.slots.push(data.state);
		}),
		'server:slots-snapshot': (data: ISseServerSlotsSnapshotPayload | Record<TServerId, IServerSlotsState>) => setState((state) => {
			// On-connect handler returns Record<serverId, snapshot>; live emit sends { snapshot }
			if ('snapshot' in data) {
				state.serverSlots[data.snapshot.serverId] = data.snapshot;
			} else {
				for (const [serverId, snap] of Object.entries(data)) {
					state.serverSlots[serverId] = snap;
				}
			}
		}),
		'checkpoints:init': (data: Record<TCheckpointId, ICheckpoint>) => setState((state) => {
			state.checkpoints = data;
		}),
		'checkpoint:created': (data: ISseCheckpointPayload) => setState((state) => {
			state.checkpoints[data.checkpoint.id] = data.checkpoint;
		}),
		'checkpoint:updated': (data: ISseCheckpointPayload) => setState((state) => {
			state.checkpoints[data.checkpoint.id] = data.checkpoint;
		}),
		'checkpoint:deleted': (data: ISseCheckpointDeletedPayload) => setState((state) => {
			delete state.checkpoints[data.checkpointId];
		}),
		'checkpoint:restored': () => {
			// State change is observed via subsequent slot:state events
		},

		// Phase 1: Proxy
		'proxy:init': (data) => setState((state) => { state.proxyStatus = data.status; state.proxyRoutes = data.routes; }),
		'proxy:update': (data) => setState((state) => { state.proxyStatus = data.status; state.proxyRoutes = data.routes; }),
		'proxy:routes': (data) => setState((state) => { state.proxyRoutes = data.routes; }),

		// Phase 1: Downloads
		'downloads:init': (data) => setState((state) => { state.downloads = data; }),
		'downloads:progress': (data: Record<TDownloadId, IDownload>) => setState((state) => {
			for (const [id, download] of Object.entries(data)) {
				state.downloads[id] = download;
			}
		}),
		'downloads:update': (data: Record<TDownloadId, IDownload>) => setState((state) => {
			for (const [id, download] of Object.entries(data)) {
				state.downloads[id] = download;
			}
		}),

		// Phase 1: Devices
		'devices:init': (data) => setState((state) => { state.devices = data; }),
		'devices:vram': (data) => setState((state) => { state.devices = data; }),

		// Phase 1: Backends
		'backends:init': (data: Record<TBackendId, IBackend>) => setState((state) => { state.backends = data; }),
		'backends:update': (data: IBackend) => setState((state) => { state.backends[data.id] = data; }),
		'backends:delete': (data: IBackend) => setState((state) => { delete state.backends[data.id]; }),

		// Phase 1: Backend Groups
		'backend-groups:init': (data: Record<TBackendGroupId, IBackendGroup>) => setState((state) => { state.backendGroups = data; }),
		'backend-groups:update': (data: IBackendGroup) => setState((state) => { state.backendGroups[data.id] = data; }),
		'backend-groups:delete': (data: IBackendGroup) => setState((state) => { delete state.backendGroups[data.id]; }),

		// MCP
		'mcp:init': (data) => setState((state) => { state.mcpServers = data; }),
		'mcp:servers': (data) => setState((state) => { state.mcpServers = data; }),

		// Recipes
		'recipes:init': (data: IRecipesInitPayload) => setState((state) => {
			state.recipes = data.recipes;
			state.activeRun = data.activeRun;
		}),
		'recipes:update': (data: IRecipe) => setState((state) => {
			state.recipes[data.id] = data;
		}),
		'recipes:delete': (data: IRecipe) => setState((state) => {
			delete state.recipes[data.id];
		}),
		'runs:started': (data: IRecipeRunState) => setState((state) => {
			state.activeRun = data;
			state.stepOutputs = {};
		}),
		'runs:step-started': (data: IRunsStepStartedPayload) => setState((state) => {
			if (!state.activeRun || state.activeRun.runId !== data.runId) return;
			const step = state.activeRun.steps.find(s => s.id === data.stepId);
			if (step) {
				step.status = ERecipeStepStatus.RUNNING;
				step.startedAt = data.startedAt;
			}
		}),
		'runs:step-output': (data: IRunsStepOutputPayload) => setState((state) => {
			if (!state.activeRun || state.activeRun.runId !== data.runId) return;
			const existing = state.stepOutputs[data.stepId] ?? '';
			state.stepOutputs[data.stepId] = existing + data.data;
		}),
		'runs:step-finished': (data: IRunsStepFinishedPayload) => setState((state) => {
			if (!state.activeRun || state.activeRun.runId !== data.runId) return;
			const step = state.activeRun.steps.find(s => s.id === data.stepId);
			if (step) {
				step.status = data.status;
				step.exitCode = data.exitCode;
				step.finishedAt = data.finishedAt;
			}
		}),
		'runs:finished': (data: IRunsFinishedPayload) => setState((state) => {
			if (!state.activeRun || state.activeRun.runId !== data.runId) return;
			state.activeRun.status = data.status;
			state.activeRun.finishedAt = data.finishedAt;
		}),
	},
});
