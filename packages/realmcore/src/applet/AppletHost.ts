import type { TAppletDefinition, IAppletFn, TAppletBaseAPI } from './types';
import { APPLET_READY, EAppletHostStatus } from './types';
import type { EventNode, TCallback } from '../events/EventNode';

export class AppletHost<TAppletAPI extends TAppletBaseAPI = TAppletBaseAPI> {
	protected fn: IAppletFn;
	protected status = EAppletHostStatus.NOT_RUNNING;
	protected api: TAppletAPI | null = null;
	private startPromise: Promise<void> | null = null;
	private terminationPromise: Promise<void> | null = null;

	constructor(protected definition: TAppletDefinition, protected eventNode: EventNode) {
		this.fn = definition.fn;
	}

	protected buildApi(): TAppletAPI {
		const _api: TAppletAPI = {
			eventNode: this.eventNode,
			onReady: (cb: TCallback) => this.eventNode.on('.', APPLET_READY, cb),
		} as TAppletAPI;

		return _api;
	}

	protected setupHostHandlers(): void {
		this.eventNode.fn('ping', () => 'pong');
	}

	public start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		this.status = EAppletHostStatus.INIT;
		console.log(`[AppletHost] Starting ${this.definition.name}`);

		this.startPromise = (async () => {
			this.api = this.buildApi();
			this.setupHostHandlers();
			await this.fn(this.api);
			this.status = EAppletHostStatus.READY;
			console.log(`[AppletHost] ${this.definition.name} ready`);
		})();

		return this.startPromise;
	}

	public terminate(): Promise<void> {
		if (this.terminationPromise) return this.terminationPromise;
		this.status = EAppletHostStatus.DEINIT;
		console.log(`[AppletHost] Terminating ${this.definition.name}`);

		this.terminationPromise = (async () => {
			this.api = null;
			console.log(`[AppletHost] ${this.definition.name} terminated`);
		})();
		return this.terminationPromise;
	}

	public isRunning(): boolean {
		return this.status === EAppletHostStatus.READY;
	}

	public getName(): string {
		return this.definition.name;
	}

	public getStatus(): EAppletHostStatus {
		return this.status;
	}

	public getEventNode(): EventNode | null {
		return this.eventNode;
	}
}
