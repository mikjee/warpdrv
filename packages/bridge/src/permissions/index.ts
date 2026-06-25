// ============================================================
// warpbridge/src/permissions/index.ts
// Permission manager — wraps persistence for tool filtering.
// Universal — no Node or browser dependencies.
// ============================================================

import type { IPermissions, IPersistence } from '../types/interfaces';
import type { IToolDefinition, TThreadId } from '../types';
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

	async getToolApprovalMode(threadId: TThreadId | undefined, serverName: string, toolName: string): Promise<EToolApprovalMode> {
		console.log('[Perm] getToolApprovalMode:', { threadId, serverName, toolName });
		// 1. Thread-level override
		if (threadId) {
			const threadPerm = await this.persistence.getThreadToolPermission(threadId, serverName, toolName);
			console.log('[Perm] thread override result:', threadPerm);
			const allThreadPerms = await this.persistence.getAllThreadToolPermissions(threadId);
			console.log('[Perm] ALL thread perms for this thread:', JSON.stringify(allThreadPerms));
			if (threadPerm) { console.log('[Perm] using thread override:', threadPerm.approvalMode); return threadPerm.approvalMode; }
		}
		// 2. Global
		const perm = await this.persistence.getToolPermission(serverName, toolName);
		console.log('[Perm] global result:', perm);
		if (perm) return perm.approvalMode;
		// 3. Default
		console.log('[Perm] fallback: ASK');
		return EToolApprovalMode.ASK;
	}

	async getEnabledTools(threadId: TThreadId | undefined, allTools: IToolDefinition[]): Promise<IToolDefinition[]> {
		const serverPerms = await this.persistence.getAllServerPermissions();
		const toolPerms = await this.persistence.getAllToolPermissions();

		// Load thread-level overrides if applicable
		const threadPerms = threadId ? await this.persistence.getAllThreadToolPermissions(threadId) : [];

		const serverPermMap = new Map(serverPerms.map(p => [p.serverName, p.enabled]));
		const toolPermMap = new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p]));
		const threadPermMap = new Map(threadPerms.map(p => [`${p.serverName}:${p.toolName}`, p]));

		return allTools.filter(tool => {
			const serverEnabled = serverPermMap.get(tool.serverName) ?? true;
			if (!serverEnabled) return false;

			// Thread override takes precedence over global
			const key = `${tool.serverName}:${tool.name}`;
			const perm = threadPerms.length > 0
				? threadPermMap.get(key) ?? toolPermMap.get(key)
				: toolPermMap.get(key);

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
