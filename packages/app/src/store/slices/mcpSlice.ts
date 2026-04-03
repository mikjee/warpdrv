import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { IMcpServerState, IToolPermission, IMcpServerPermission } from '@warpcore/shared';

export function createMcpSlice(set: ImmerSet<AppState>, _get: ImmerGet<AppState>) {
	return {
		mcpServers: {} as Record<string, IMcpServerState>,
		mcpServerPermissions: [] as IMcpServerPermission[],
		mcpToolPermissions: [] as IToolPermission[],

		setMcpServers: (servers: Record<string, IMcpServerState>) => {
			set((draft) => { draft.mcpServers = servers; });
		},
		setMcpPermissions: (serverPerms: IMcpServerPermission[], toolPerms: IToolPermission[]) => {
			set((draft) => {
				draft.mcpServerPermissions = serverPerms;
				draft.mcpToolPermissions = toolPerms;
			});
		},
	};
}