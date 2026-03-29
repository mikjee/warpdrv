import type { StateCreator } from 'zustand';
import type { AppState } from '../types';

interface SSEHandlersSlice {
	SSEHandlers: Record<string, (data: any) => void>;
}

export const sseHandlersSlice: StateCreator<AppState, [], [], SSEHandlersSlice> = (set, _get, _initialState) => ({
	SSEHandlers: {
		// Phase 0.5 test handler
		test: (data) => set({ testData: data }),

		// Phase 1: Servers
		'servers:list': (data) => set({ servers: data }),
		'servers:update': (data) => set((state) => ({
			servers: { ...state.servers, ...data },
		})),
		'servers:stats': (data) => {
			if (data && Object.keys(data).length > 0) {
				set((state) => ({ serverStats: { ...state.serverStats, ...data } }));
			}
		},
		'servers:logs': (data) => set((state) => ({
			serverLogs: { ...state.serverLogs, ...data },
		})),

		// Phase 1: Proxy
		'proxy:init': (data) => set({ proxyStatus: data.status, proxyRoutes: data.routes }),
		'proxy:update': (data) => set({ proxyStatus: data.status, proxyRoutes: data.routes }),
		'proxy:routes': (data) => set({ proxyRoutes: data.routes }),

		// Phase 1: Downloads
		'downloads:init': (data) => set({ downloads: data }),
		'downloads:progress': (data) => set((state) => ({
			downloads: { ...state.downloads, ...data },
		})),
		'downloads:update': (data) => set((state) => ({
			downloads: { ...state.downloads, ...data },
		})),

		// Phase 1: Devices
		'devices:init': (data) => set({ devices: data }),
		'devices:vram': (data) => set({ devices: data }),
	},
});
