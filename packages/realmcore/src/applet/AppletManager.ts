import { AppletHost } from './AppletHost';
import type { TAppletDefinition } from './types';
import { EAppletHostType, EAppletScope } from './types';
import type { EventNode } from '../events/EventNode';
import { EventNode as EventNodeClass } from '../events/EventNode';

export class AppletManager {
	public eventNode: EventNode;
	private scope: EAppletScope;
	private scopeValue: string | undefined;
	private hostClasses: Record<EAppletHostType, typeof AppletHost>;
	private applets: Record<string, TAppletDefinition>;
	private activeApplets: Record<string, { host: AppletHost; eventNode: EventNode }> = {};
	private terminatingHosts: Record<string, Promise<void>> = {};

	constructor(
		eventNode: EventNode,
		scope: EAppletScope,
		scopeValue: string | undefined,
		hostClasses: Record<EAppletHostType, typeof AppletHost>,
		applets: Record<string, TAppletDefinition>,
	) {
		this.eventNode = eventNode;
		this.scope = scope;
		this.scopeValue = scopeValue;
		this.hostClasses = hostClasses;
		this.applets = applets;
	}

	private createHost(definition: TAppletDefinition, eventNode: EventNode): AppletHost {
		return new this.hostClasses[definition.hostType](definition, eventNode);
	}

	public async initialize(appletName: string, opts?: { terminate?: boolean }): Promise<void> {
		if (opts?.terminate) {
			await this.terminate(appletName);
		} else {
			const existing = this.activeApplets[appletName];
			if (existing && existing.host.isRunning()) return;
		}

		const definition = this.applets[appletName];
		if (!definition) return;
		if (!this.hostClasses[definition.hostType] || definition.scope !== this.scope) return;

		const eventNode = new EventNodeClass(definition.name, false);
		const host = this.createHost(definition, eventNode);
		await this.eventNode.addChild(eventNode);
		try {
			await host.start();
		} catch (err) {
			console.error(`[AppletManager] ${definition.name} failed to start:`, err);
			await this.eventNode.removeChild(eventNode.nodeId);
			return;
		}
		this.activeApplets[appletName] = { host, eventNode };
	}

	public async initializeAll(): Promise<void> {
		await this.terminateAll();
		for (const key of Object.keys(this.applets)) {
			await this.initialize(key, { terminate: true });
		}
	}

	public async updateScopeValue(newValue: string | undefined): Promise<void> {
		newValue ??= undefined;
		if (this.scopeValue === newValue) return;
		this.scopeValue = newValue;
		await this.initializeAll();
	}

	public terminate(appletName: string): Promise<void> {
		if (!!this.terminatingHosts[appletName]) return this.terminatingHosts[appletName];

		const entry = this.activeApplets[appletName];
		if (!entry) return Promise.resolve();

		this.terminatingHosts[appletName] = (async () => {
			await entry.host.terminate();
			await this.eventNode.removeChild(entry.eventNode.nodeId);
			delete this.activeApplets[appletName];
			delete this.terminatingHosts[appletName];
		})();
		return this.terminatingHosts[appletName];
	}

	public async terminateAll(): Promise<void> {
		const promises = Object.keys(this.activeApplets).map(k => this.terminate(k));
		await Promise.all(promises);
	}

	public getActiveApplets(): Record<string, { host: AppletHost; eventNode: EventNode }> {
		return this.activeApplets;
	}

	public getScopeValue(): string | undefined {
		return this.scopeValue;
	}
}
