// ============================================================
// FILE: packages/shared/src/mcp-types.ts
// MCP config types for WarpCore
// ============================================================

// A single MCP server entry in mcp.json
export interface IMcpServerEntry {
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	url?: string;
	headers?: Record<string, string>;
	timeout?: number;
	warpdrv?: IWarpdrvServerExt;
}

export interface IWarpdrvServerExt {
	renderers?: Record<string, IRendererConfig>;
}

export interface IRendererConfig {
	component: ERendererComponent;
	strategy?: string;
	argMap?: Record<string, string>;
}

export enum ERendererComponent {
	DIFF = 'diff',
	BASH = 'bash',
	FETCH = 'fetch',
}

// The mcp.json file shape (Cursor-compatible)
export interface IMcpConfigFile {
	mcpServers: Record<string, IMcpServerEntry>;
}
