import type { TAppletDefinition, IAppletFn } from './types';
import { EAppletHostStatus } from './types';

export class AppletHost {
	protected definition: TAppletDefinition;
	protected fn: IAppletFn;
	protected status = EAppletHostStatus.NOT_RUNNING;
	protected api: any = null;
	private startPromise: Promise<void> | null = null;
	private terminationPromise: Promise<void> | null = null;

	constructor(definition: TAppletDefinition) {
		this.definition = definition;
		this.fn = definition.fn;
	}

	public buildApi(): any {
		throw new Error(`buildApi() must be implemented by ${this.constructor.name}`);
	}

	public start(): Promise<void> {
		if (this.startPromise) return this.startPromise;
		this.status = EAppletHostStatus.INIT;
		console.log(`[AppletHost] Starting ${this.definition.name}`);
		this.startPromise = (async () => {
			this.api = this.buildApi();
			await this.fn(this.api);
			this.status = EAppletHostStatus.READY;
			this.startPromise = null;
			console.log(`[AppletHost] ${this.definition.name} ready`);
		})();
		return this.startPromise;
	}

	public terminate(): Promise<void> {
		if (this.status === EAppletHostStatus.NOT_RUNNING || this.status === EAppletHostStatus.DEINIT) return Promise.resolve();
		if (this.terminationPromise) return this.terminationPromise;
		this.status = EAppletHostStatus.DEINIT;
		console.log(`[AppletHost] Terminating ${this.definition.name}`);
		this.terminationPromise = (async () => {
			this.api = null;
			this.terminationPromise = null;
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
}
