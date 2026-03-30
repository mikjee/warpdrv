import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';

interface ProxySlice {
	proxyStatus: IProxyStatus | null;
	proxyRoutes: IStickyRouteInfo[];
}

export const proxySlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	proxyStatus: null,
	proxyRoutes: [],
});
