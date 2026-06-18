// ============================================================
// warpbridge/src/server.ts
// Backend entry point — exports everything.
// ============================================================

// Types
export * from './types';
export * from './types/interfaces';

// Parser (universal)
export * from './parser';

// Validation (universal)
export { validateToolArgs, isSafePath, cleanSchema } from './validation';

// Permissions (universal)
export { PermissionManager } from './permissions';

// MCP (Node only)
export { McpClientManager } from './mcp/client';
export { McpConfig } from './mcp/config';

// Orchestrator (Node only)
export { Orchestrator, type IOrchestratorConfig, type IPureCompletionResult, type TPureCompletionChunkHandler } from './orchestrator';

// Persistence (Node only)
export { SqlitePersistence } from './persistence/betterSqlite';
export { SqlitePersistenceWithBroadcast } from './persistence/sqliteBroadcast';
export type { IBetterSqlitePersistenceOptions } from './persistence/betterSqlite';

// Store (universal)
export { createChatStoreSlice, type IChatStoreState, type ImmerSet, type ImmerGet } from './store';

// sse broadcaster
export { SseBroadcaster } from './broadcaster/sseBroadcaster';
export type { IBridgeBroadcaster } from './types/interfaces';
