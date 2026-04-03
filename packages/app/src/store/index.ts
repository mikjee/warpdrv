import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { subscribeWithSelector } from 'zustand/middleware';
import type { AppState, ImmerSet, ImmerGet } from './types';
import { sseConnectionSlice } from './slices/sseConnection';
import { sseHandlersSlice } from './slices/sseHandlers';
import { serversSlice } from './slices/servers';
import { downloadsSlice } from './slices/downloads';
import { devicesSlice } from './slices/devices';
import { proxySlice } from './slices/proxy';
import { createMcpSlice } from '@/store/slices/mcpSlice';

export const useStore = create<AppState>()(
	subscribeWithSelector(
		immer((set: ImmerSet<AppState>, get: ImmerGet<AppState>): AppState => {
			const sseConnection = sseConnectionSlice(set, get);
			const servers = serversSlice(set, get);
			const downloads = downloadsSlice(set, get);
			const devices = devicesSlice(set, get);
			const proxy = proxySlice(set, get);
			const sseHandlers = sseHandlersSlice(set, get);
			const mcp = createMcpSlice(set, get);

			return {
				sseConnected: sseConnection.sseConnected!,
				setSseConnected: sseConnection.setSseConnected!,
				testData: sseConnection.testData!,
				servers: servers.servers!,
				serverStats: servers.serverStats!,
				serverLogs: servers.serverLogs!,
				downloads: downloads.downloads!,
				devices: devices.devices!,
				proxyStatus: proxy.proxyStatus!,
				proxyRoutes: proxy.proxyRoutes!,
				SSEHandlers: sseHandlers.SSEHandlers!,
				mcpServers: mcp.mcpServers!,
				mcpServerPermissions: mcp.mcpServerPermissions!,
				mcpToolPermissions: mcp.mcpToolPermissions!,
				setMcpServers: mcp.setMcpServers!,
				setMcpPermissions: mcp.setMcpPermissions!,
			};
		}),
	),
);
