import { AppletHost } from './AppletHost';
import type { TAppletDefinition } from './types';
import { APPLET_READY, EAppletHostType, EAppletScope } from './types';
import type { EventNode } from '../events/EventNode';
import { EventNode as EventNodeClass } from '../events/EventNode';

export class AppletManager {
	private activeApplets: Record<string, { host: AppletHost; eventNode: EventNode }> = {};
	private terminatingHosts: Record<string, Promise<void>> = {};

constructor(
		public eventNode: EventNode,
		protected scope: EAppletScope,
		protected scopeValue: string | undefined,
		protected hostClasses: Partial<Record<EAppletHostType, typeof AppletHost<any>>>,
		protected applets: Record<string, TAppletDefinition>,
		protected autoStart: Record<string, boolean> = {},
	) {	}

	private createHost(definition: TAppletDefinition, eventNode: EventNode): AppletHost {
		const hostClass = this.hostClasses[definition.hostType];
		if (!hostClass) throw `[Realm] FATAL: Class not found for host type ${definition.hostType}.`;
		return new hostClass(definition, eventNode);
	}

	public async initialize(appletName: string, opts?: { 
		terminate?: boolean,
		preventReady? : boolean,
	}): Promise<boolean> {
		if (opts?.terminate) {
			await this.terminate(appletName);
		} else {
			const existing = this.activeApplets[appletName];
			if (existing && existing.host.isRunning()) return false;
		}

		const definition = this.applets[appletName];
		if (!definition) return false;
		if (!this.hostClasses[definition.hostType] || definition.scope !== this.scope) return false;

		const eventNode = new EventNodeClass(definition.name, false);
		await this.eventNode.addChild(eventNode);
		const host = this.createHost(definition, eventNode);
		
		try {
			await host.start();
		} catch (err) {
			console.error(`[AppletManager] ${definition.name} failed to start:`, err);
			await this.eventNode.removeChild(eventNode.nodeId);
			return false;
		}

		this.activeApplets[appletName] = { host, eventNode };
		if (!opts?.preventReady) eventNode.broadcast(APPLET_READY);
		return true;
	}

	public async initializeAll(): Promise<void> {
		const autoStartArr = Object.keys(this.autoStart)
			.filter(appletName => this.autoStart[appletName]);

		const statusArr = await Promise.all(
			autoStartArr.map(appletName => this.initialize(appletName, { preventReady: true }))
		);

		autoStartArr
			.filter((_, i) => statusArr[i])
			.map(appletName => this.activeApplets[appletName].eventNode.broadcast(APPLET_READY))
	}

	public async updateScopeValue(newValue: string | undefined): Promise<void> {
		newValue ??= undefined;
		if (this.scopeValue === newValue) return;
		
		await this.terminateAll();
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
