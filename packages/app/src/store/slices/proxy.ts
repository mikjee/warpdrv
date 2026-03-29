import type { StateCreator } from 'zustand';
import type { AppState } from '../types';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';

interface ProxySlice {
	proxyStatus: IProxyStatus | null;
	proxyRoutes: IStickyRouteInfo[];
}

export const proxySlice: StateCreator<AppState, [], [], ProxySlice> = (_set, _get, _initialState) => ({
	proxyStatus: null,
	proxyRoutes: [],
});
