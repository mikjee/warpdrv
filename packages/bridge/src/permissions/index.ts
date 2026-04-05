// ============================================================
// warpbridge/src/permissions/index.ts
// Permission manager — wraps persistence for tool filtering.
// Universal — no Node or browser dependencies.
// ============================================================

import type { IPermissions, IPersistence } from '../types/interfaces';
import type { IToolDefinition } from '../types';
import { EToolApprovalMode } from '../types';

export class PermissionManager implements IPermissions {
	private persistence: IPersistence;

	constructor(persistence: IPersistence) {
		this.persistence = persistence;
	}

	async isServerEnabled(serverName: string): Promise<boolean> {
		const perm = await this.persistence.getServerPermission(serverName);
		return perm?.enabled ?? true; // default enabled
	}

	async getToolApprovalMode(serverName: string, toolName: string): Promise<EToolApprovalMode> {
		const perm = await this.persistence.getToolPermission(serverName, toolName);
		return perm?.approvalMode ?? EToolApprovalMode.ASK; // default ask
	}

	async getEnabledTools(allTools: IToolDefinition[]): Promise<IToolDefinition[]> {
		const serverPerms = await this.persistence.getAllServerPermissions();
		const toolPerms = await this.persistence.getAllToolPermissions();

		const serverPermMap = new Map(serverPerms.map(p => [p.serverName, p.enabled]));
		const toolPermMap = new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p]));

		return allTools.filter(tool => {
			const serverEnabled = serverPermMap.get(tool.serverName) ?? true;
			if (!serverEnabled) return false;

			const perm = toolPermMap.get(`${tool.serverName}:${tool.name}`);
			const toolEnabled = perm?.enabled ?? true;
			if (!toolEnabled) return false;

			if (perm?.approvalMode === EToolApprovalMode.DENIED) return false;

			return true;
		});
	}

	async setServerEnabled(serverName: string, enabled: boolean): Promise<void> {
		await this.persistence.setServerPermission(serverName, enabled);
	}

	async setToolPermission(
		serverName: string,
		toolName: string,
		enabled: boolean,
		approvalMode: EToolApprovalMode,
	): Promise<void> {
		await this.persistence.setToolPermission(serverName, toolName, enabled, approvalMode);
	}
}
