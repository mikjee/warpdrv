import type { TServerId, IServer, IServerStats, TDownloadId, IDownload, IDevice } from '@warpcore/shared';
import type { IProxyStatus, IStickyRouteInfo } from '@/api/services';
import type { WritableDraft } from 'immer';
import type { IMcpServerState, IToolPermission, IServerPermission as IMcpServerPermission } from '@warpcore/bridge';

export type ImmerSet<T> = (fn: (state: WritableDraft<T>) => void) => void;
export type ImmerGet<T> = () => T;

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

	// MCP (Phase 2)
	mcpServers: Record<string, IMcpServerState>;
	mcpServerPermissions: IMcpServerPermission[];
	mcpToolPermissions: IToolPermission[];
	setMcpServers: (servers: Record<string, IMcpServerState>) => void;
	setMcpPermissions: (serverPerms: IMcpServerPermission[], toolPerms: IToolPermission[]) => void;
}
