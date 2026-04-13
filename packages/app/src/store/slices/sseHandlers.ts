import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, TBackendId, IBackend, TBackendGroupId, IBackendGroup } from '@warpcore/shared';

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
	},
});
