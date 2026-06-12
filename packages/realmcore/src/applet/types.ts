import type { EventNode } from '../events/EventNode';

export enum EAppletHostType {
	BE = 'be',
	FE = 'fe',
}

export enum EAppletScope {
	GLOBAL = 'global',
	WORKSPACE = 'workspace',
	THREAD = 'thread',
}

export enum EAppletHostStatus {
	NOT_RUNNING = 'notRunning',
	INIT = 'init',
	READY = 'ready',
	DEINIT = 'deinit',
}

export interface TAppletDefinition<TApi = any> {
	name: string;
	description: string;
	fn: IAppletFn<TApi>;
	hostType: EAppletHostType;
	scope: EAppletScope;
}

export type IAppletFn<TApi = any> = (api: TApi) => Promise<void>;

export interface IAppletApiBE {
	eventNode: EventNode;
}

export interface IAppletApiFE {
	eventNode: EventNode;
}
