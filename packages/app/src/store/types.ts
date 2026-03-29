import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, IDevice } from '@warpcore/shared';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';

export interface AppState {
	// SSE Connection
	sseConnected: boolean;
	setSseConnected: (connected: boolean) => void;

	// Phase 0.5 Test
	testData: any | null;

	// Servers (Phase 1)
	servers: Record<TServerId, IServer>;
	serverStats: Record<TServerId, IServerStats>;
	serverLogs: Record<TServerId, string[]>;

	// Downloads (Phase 1)
	downloads: Record<TDownloadId, IDownload>;

	// Devices (Phase 1)
	devices: IDevice[];

	// Proxy (Phase 1)
	proxyStatus: IProxyStatus | null;
	proxyRoutes: IStickyRouteInfo[];

	// SSE Event Handlers (centralized)
	SSEHandlers: Record<string, (data: any) => void>;
}
