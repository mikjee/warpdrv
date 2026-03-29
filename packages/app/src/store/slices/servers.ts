import type { StateCreator } from 'zustand';
import type { TServerId, IServer, IServerStats } from '@warpcore/shared';
import type { AppState } from '../types';

interface ServersSlice {
	servers: Record<TServerId, IServer>;
	serverStats: Record<TServerId, IServerStats>;
	serverLogs: Record<TServerId, string[]>;
}

export const serversSlice: StateCreator<AppState, [], [], ServersSlice> = (_set, _get, _initialState) => ({
	servers: {},
	serverStats: {},
	serverLogs: {},
});
