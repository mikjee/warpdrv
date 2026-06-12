import { AppletHost } from './AppletHost';
import { AppletHostBE } from './AppletHostBE';
import { AppletHostFE } from './AppletHostFE';
import type { TAppletDefinition } from './types';
import { EAppletHostType, EAppletScope, EAppletHostStatus } from './types';
import type { EventNode } from '../events/EventNode';

export class AppletManager {
	public node: EventNode;
	private scope: EAppletScope;
	private scopeValue: string | undefined;
	private hostType: EAppletHostType;
	private applets: Record<string, TAppletDefinition>;
	private activeApplets = new Map<string, AppletHost>();

	constructor(
		node: EventNode,
		scope: EAppletScope,
		scopeValue: string | undefined,
		hostType: EAppletHostType,
		applets: Record<string, TAppletDefinition>,
	) {
		this.node = node;
		this.scope = scope;
		this.scopeValue = scopeValue;
		this.hostType = hostType;
		this.applets = applets;
	}

	private createHost(definition: TAppletDefinition): AppletHost {
		if (this.hostType === EAppletHostType.BE) {
			return new AppletHostBE(definition);
		}
		return new AppletHostFE(definition);
	}

	public async initialize(): Promise<void> {
		await this.terminateAll();

		for (const key of Object.keys(this.applets)) {
			const definition = this.applets[key];
			if (definition.hostType !== this.hostType) continue;
			if (definition.scope !== this.scope) continue;

			const host = this.createHost(definition);
			host.start().catch(err => {
				console.error(`[AppletManager] ${definition.name} failed to start:`, err);
			});
			this.activeApplets.set(key, host);
		}
	}

	public async updateScopeValue(newValue: string | undefined): Promise<void> {
		if (this.scopeValue === newValue) return;
		this.scopeValue = newValue;
		await this.initialize();
	}

	public async terminateAll(): Promise<void> {
		const promises: Promise<void>[] = [];
		for (const host of this.activeApplets.values()) {
			if (host.getStatus() !== EAppletHostStatus.NOT_RUNNING && host.getStatus() !== EAppletHostStatus.DEINIT) {
				promises.push(host.terminate());
			}
		}
		await Promise.all(promises);
		this.activeApplets.clear();
	}

	public getActiveApplets(): Map<string, AppletHost> {
		return this.activeApplets;
	}

	public getScopeValue(): string | undefined {
		return this.scopeValue;
	}
}
