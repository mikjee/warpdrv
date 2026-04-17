# Bridge Package

Core inference orchestration layer between WarpCore and llama-server. Single source of truth for chat state.

## Overview

The Bridge package (`@warpcore/bridge`) handles all chat-related logic: inference orchestration, message management, MCP tool execution, permissions, and real-time event broadcasting. The frontend never generates IDs or makes inference decisions — it only mirrors Bridge events.

## Architecture

### Orchestrator

`packages/bridge/src/orchestrator/index.ts`

Core inference flow. Entry point:

- `handleCompletion()` — Receives completion request from frontend, auto-creates thread if needed
- `executePass()` — Runs one inference pass, creates one assistant message
- `runPass()` — Streams response from llama-server, persists parts, emits events
- `resumeToolCall()` — Approves/denies tool calls, auto-triggers next pass when all resolved
- Recursive multi-pass: if tools auto-resolve, recursively calls `executePass()` with new assistant child of last tool

### SqlitePersistence

`packages/bridge/src/persistence/betterSqlite.ts`

SQLite persistence via better-sqlite3:

- Tables: `threads`, `messages`, `message_parts`, `tool_calls`, `folders`, `thread_configs`, `mcp_server_permissions`, `mcp_tool_permissions`
- Message tree via `parentId`, no `ORDER BY createdAt` — traverses chain instead
- Foreign keys disabled for flexibility
- WAL mode enabled
- Data stored in `~/.config/warpcore/chat.db`

### SseBroadcaster

`packages/bridge/src/broadcaster/sseBroadcaster.ts`

Real-time event broadcasting via better-sse:

- HTTP sessions register via `getChannel().register(session)`
- In-process subscribers for local listeners
- All events fan-out to all registered sessions
- Sessions never close normally — close on client disconnect

### McpClientManager

`packages/bridge/src/mcp/client.ts`

MCP server connection and tool execution:

- Tool discovery and execution via `@modelcontextprotocol/sdk`
- `getAllTools()` — List all available tools across all connected servers
- `findToolServer()` — Find which server provides a given tool
- `executeToolCall()` — Execute a tool call and return the result
- Supports stdio and HTTP transports

### PermissionManager

`packages/bridge/src/permissions/index.ts`

Tool approval policy management:

- `getToolApprovalMode(serverName, toolName)` → `ALLOWED | ASK | DENIED`
- `getEnabledTools()` — Filters out DENIED tools during tool discovery
- Permissions stored in SQLite: `mcp_server_permissions` and `mcp_tool_permissions` tables
- Falls back through tool-level permission → server-level permission → default ALLOWED

## Event System

All state changes emit events via `broadcaster.emit()`. Frontend subscribes once to `/api/chat/events`.

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `thread.created/updated/deleted` | Thread object | Thread lifecycle |
| `message.created/patched/deleted` | Message object | Message lifecycle |
| `message.chunk` | Streaming delta | Token-by-token streaming |
| `tool_call.created/updated` | Tool call object | Tool call lifecycle |
| `inference.started/ended` | Thread ID | Inference state |

### Checkpoint vs Progress Events

- **Checkpoint events** (`message.created`, `message.patched`) carry full authoritative state
- **Progress events** (`message.chunk`) carry streaming deltas
- Frontend can drop all chunks and still display correct state via checkpoints

## Message Tree Model

Messages form a tree via `parentId` references:

```
assistant (pass 1)
  └── toolMsg(A)
        └── toolMsg(B)
              └── toolMsg(C)
                    └── assistant (pass 2, after all tools resolved)
```

- Tool messages chain linearly (not siblings) — preserves single canonical order
- Branching via regen/edit: new message with same `parentId` creates a branch
- `headMessageIdByThread` tracks current active branch in frontend store

## Key Files

| File | Purpose |
|------|---------|
| `packages/bridge/src/orchestrator/index.ts` | Core inference orchestration |
| `packages/bridge/src/persistence/betterSqlite.ts` | SQLite persistence |
| `packages/bridge/src/broadcaster/sseBroadcaster.ts` | SSE fan-out |
| `packages/bridge/src/mcp/client.ts` | MCP tool execution |
| `packages/bridge/src/permissions/index.ts` | Tool approval policies |
| `packages/bridge/src/parser.ts` | SSE parsing from llama-server |
| `packages/bridge/src/client.ts` | Frontend Bridge client (events + API helpers) |

## Key Design Decisions

- **Single source of truth**: Bridge owns all message IDs, message tree structure, and tool call state. Frontend never generates IDs.
- **Fire-and-forget**: Completions are fire-and-forget POSTs. All state updates flow via SSE.
- **No optimistic updates**: Frontend never updates state before receiving SSE events.
- **Detached processes**: Server processes are spawned detached — they survive UI restarts.
- **No inference params handling**: WarpCore does NOT manage temperature, samplers, or other inference params — those come from the frontend and are passed through to llama-server.
