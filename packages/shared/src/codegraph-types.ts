export interface ICodeGraphNode {
	id: string;
	symbol: string;
	kind: string;
	language: string;
	filePath: string;
	startLine: number;
	endLine: number;
	startCol: number;
	endCol: number;
	signature?: string;
	isExported: boolean;
	resolved?: boolean;
}

export interface ICodeGraphEdge {
	sourceId: string;
	filePath: string;
	targetSymbol: string;
	edgeType: string;
}

export interface ICodeGraphFile {
	id: string;
	projectId: string;
	filePath: string;
	language: string;
	mtime: number;
	contentHash: string;
	indexedAt: number;
}

export interface ICodeGraphSearchOptions {
	kind?: string;
	filePath?: string;
	limit?: number;
	fuzzy?: boolean;
}

export interface ICodeGraphIngestResult {
	filesIndexed: number;
	filesUpdated: number;
	filesSkipped: number;
	nodesCreated: number;
	edgesCreated: number;
}

export type TCodeGraphKind =
	| 'function'
	| 'class'
	| 'interface'
	| 'type'
	| 'variable'
	| 'method'
	| 'enum'
	| 'module'
	| 'namespace'
	| 'property'
	| 'parameter'
	| 'const'
	| 'struct';

export type TCodeGraphEdgeType = 'calls' | 'extends' | 'implements' | 'imports' | 'references' | 'contains';
