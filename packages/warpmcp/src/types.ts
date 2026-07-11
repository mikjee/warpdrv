import type { IAccessToken, ITodoItem } from '@warpcore/shared';
export interface IEmbeddingSearchResult {
	messageId: string;
	text: string;
	distance: number;
}
export interface ITodoResult {
	todos: ITodoItem[];
	etag: string | null;
}
export interface IWarpmcpDeps {
	isRemote: (req: { ip: string; connection: { remoteAddress: string } }) => boolean;
	validateBearerToken: (authHeader: string | undefined) => Promise<IAccessToken | null>;
	getFsAllowedRoots: () => string[];
	embeddingSearch?: (query: string, topK: number, topic: string) => Promise<IEmbeddingSearchResult[]>;
	todoRead?: (threadId: string) => Promise<ITodoResult>;
	todoAdd?: (threadId: string, todo: ITodoItem, index?: number) => Promise<ITodoItem[]>;
	todoRemove?: (threadId: string, index: number) => Promise<ITodoItem[]>;
	todoUpdate?: (threadId: string, index: number, status: ITodoItem['status']) => Promise<ITodoItem[]>;
	todoClear?: (threadId: string) => Promise<ITodoItem[]>;
	todoWrite?: (threadId: string, todos: ITodoItem[], etag?: string) => Promise<ITodoResult>;
	getProjectRoot?: (threadId: string) => Promise<string | null>;
}
export interface IStartArgs extends IWarpmcpDeps {
	port: number;
	exposeExternal: boolean;
}
export interface IStartResult {
	port: number;
	bindHost: string;
}
