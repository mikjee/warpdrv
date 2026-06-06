import type { IAccessToken } from '@warpcore/shared';
export interface IEmbeddingSearchResult {
	messageId: string;
	text: string;
	distance: number;
}
export interface IWarpmcpDeps {
	isRemote: (req: { ip: string; connection: { remoteAddress: string } }) => boolean;
	validateBearerToken: (authHeader: string | undefined) => Promise<IAccessToken | null>;
	getFsAllowedRoots: () => string[];
	embeddingSearch?: (query: string, topK: number, topic: string) => Promise<IEmbeddingSearchResult[]>;
}
export interface IStartArgs extends IWarpmcpDeps {
	port: number;
	exposeExternal: boolean;
}
export interface IStartResult {
	port: number;
	bindHost: string;
}
