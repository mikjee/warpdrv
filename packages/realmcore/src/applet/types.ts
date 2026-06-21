import type { EventNode, TCallback, TCallbackId } from '../events/EventNode';

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

export type TAppletBaseAPI = {
	eventNode: EventNode,
	onReady: (cb: TCallback) => Promise<TCallbackId>,
	onTerminate: (cb: TCallback) => Promise<TCallbackId>,
}

export const APPLET_READY = "applet.ready";
export const APPLET_TERMINATE = "applet.terminate";

export type IAppletFn<TApi = any> = (api: TApi) => Promise<void>;

