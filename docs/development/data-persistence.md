# Data Persistence

Storage locations and schemas for WarpCore's persistent data.

## JSON Store

**File:** `~/.config/warpcore/warpcore-data.json`

Keys are namespaced in a single JSON file:

| Key Prefix | Data |
|------------|------|
| `settings:general` | ISettings (model dirs, proxy config, etc.) |
| `backends:{id}` | IBackend (llama.cpp builds) |
| `servers:{id}` | IServer (running llama-server instances) |
| `presets:{id}` | IPreset (inference param presets) |
| `downloads:{id}` | IDownload (model download history) |
| `recipe:{id}` | IRecipe (recipe definitions) |
| `recipeState:{id}` | IRecipeState (last inputs, last run status) |
| `backendGroups:{id}` | IBackendGroup (backend group configs) |
| `_schemaVersion` | number (migration tracking) |

**Service:** `packages/server/src/util/store.ts`
- `get()`, `put()`, `del()`, `list()` — CRUD operations on namespaced keys
- Schema migrations run on startup — numbered functions, never delete user data, only transform

## SQLite (Chat Database)

**File:** `~/.config/warpcore/chat.db`

SQLite database via better-sqlite3. Bridge schema:

| Table | Columns | Description |
|-------|---------|-------------|
| `threads` | id, title, folderId, systemPrompt, createdAt, updatedAt, tokenCounts | Chat threads with metadata |
| `messages` | id, parentId, threadId, role, content, stats, createdAt | Message tree via parentId |
| `message_parts` | id, messageId, type, orderIndex, text, toolCallId, data, mimeType, fileName, fileSize | Message content parts |
| `tool_calls` | id, messageId, threadId, serverName, toolName, arguments, result, status, error | MCP tool execution records |
| `folders` | id, name, parentId, sortOrder | Thread organization |
| `thread_configs` | threadId, presetId, systemPrompt, params | Per-thread config |
| `mcp_server_permissions` | serverName, mode (ALLOWED/ASK/DENIED) | Server-level tool policies |
| `mcp_tool_permissions` | serverName, toolName, mode | Per-tool approval mode |

**Configuration:** WAL mode enabled, foreign keys disabled for flexibility. No `ORDER BY createdAt` in message fetch — traverses parentId chain instead.

## MCP Config File

**File:** `~/.config/warpcore/mcp.json` (platform-specific)

Cursor-compatible JSON format:

```json
{
  "mcpServers": {
    "server-name": {
      "command": "/usr/bin/node",
      "args": ["/path/to/server.mjs"],
      "env": { "API_KEY": "secret" },
      "timeout": 30
    }
  }
}
```

**Service:** `packages/server/src/util/mcpConfig.ts`
- `readMcpConfig()` / `writeMcpConfig()` — read/write with pretty-printing (tabs)
- `addMcpServer()` / `removeMcpServer()` / `updateMcpServer()` — CRUD on server entries
- Platform-specific config path resolution

## Chat Presets

**File:** `~/.config/warpcore/chat-presets.json`

JSON file service (not SQLite) for inference parameter presets. Separate from thread configs.

**Service:** `packages/server/src/services/presetStore.ts`
- CRUD operations for presets (create, read, update, delete)
- Stored as a JSON file, not in the main JSON store

## Data Directory Summary

| File | Contents |
|------|----------|
| `warpcore-data.json` | Settings, backends, servers, presets, downloads, recipes, backend groups |
| `chat.db` | Chat threads, messages, tool calls, permissions |
| `mcp.json` | MCP server configurations |
| `chat-presets.json` | Inference parameter presets |
| `checkpoints/` | Checkpoint `.bin` files and `.json` sidecars |

## Checkpoint Storage

**Directory:** Configurable (default: `~/.config/warpcore/checkpoints/`)

Each checkpoint:
- `<id>.bin` — KV cache binary
- `<id>.json` — Metadata sidecar (id, bundleId, serverId, slotIndex, fingerprint, sizeBytes, tokens, createdAt)

Fingerprint is computed from model filename + file size (SHA-256, first 16 chars).

## Schema Migrations

Migrations run on startup via numbered functions in `packages/server/src/util/store.ts`:

- Each migration is a function named `v{number}`
- Migrations transform existing data, never delete
- `_schemaVersion` tracks the current version
- If data is from an older version, all pending migrations run in order
