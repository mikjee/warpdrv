import type { StateCreator } from 'zustand';
import type { AppState } from '../types';

interface SSEHandlersSlice {
	SSEHandlers: Record<string, (data: any) => void>;
}

export const sseHandlersSlice: StateCreator<AppState, [], [], SSEHandlersSlice> = (set, _get, _initialState) => ({
	SSEHandlers: {
		// Phase 0.5 test handler
		test: (data) => set({ testData: data }),

		// Phase 1 handlers (add as needed)
		// servers: (data) => set({ servers: data }),
		// 'servers:update': (data) => set((state) => {
		// 	Object.assign(state.servers, data);
		// }),
		// 'servers:stats': (data) => set({ serverStats: data }),
		// downloads: (data) => set({ downloads: data }),
		// 'downloads:progress': (data) => set((state) => {
		// 	Object.assign(state.downloads, data);
		// }),
		// devices: (data) => set({ devices: data }),
		// proxy: (data) => set({ proxyStatus: data.status, proxyRoutes: data.routes }),
	},
});
