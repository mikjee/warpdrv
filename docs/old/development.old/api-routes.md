# API Routes

Master index of all API routes in WarpCore.

## WarpCore Management

| Route | Method | Description |
|-------|--------|-------------|
| `/api/settings` | GET/PUT | App settings (model dirs, proxy config, etc.) |
| `/api/backends` | GET/POST | List/create backend builds |
| `/api/backends/:id` | GET/PUT/DELETE | Backend CRUD |
| `/api/backends/:id/validate` | POST | Validate backend binary and discover devices |
| `/api/backend-groups` | GET/POST | List/create backend groups |
| `/api/backend-groups/:id` | GET/PUT/DELETE | Backend group CRUD |
| `/api/models` | GET | Scanned GGUF models |
| `/api/models/scan` | POST | Rescan model directories |
| `/api/servers` | GET/POST | Llama-server instances |
| `/api/servers/:id/stop` | POST | Stop server |
| `/api/servers/:id/restart` | POST | Restart server |
| `/api/servers/:id` | DELETE | Delete server config |
| `/api/servers/:id/logs` | GET/DELETE | Get/clear server logs |
| `/api/presets` | GET/POST/DELETE | Inference param presets (legacy) |

## Chat

| Route | Method | Description |
|-------|--------|-------------|
| `/api/chat/threads` | GET/POST | List/create threads |
| `/api/chat/threads/:id` | GET/PUT/DELETE | Get/update/delete thread |
| `/api/chat/threads/:id/config` | GET/PUT | Thread config (system prompt, params) |
| `/api/chat/threads/:id/messages` | GET/POST | Get/create messages (bulk seed) |
| `/api/chat/messages/:id` | PUT/DELETE | Edit/delete message parts |
| `/api/chat/folders` | GET/POST | List/create folders |
| `/api/chat/folders/:id` | PUT/DELETE | Update/delete folder |
| `/api/chat/folders/reorder` | PUT | Batch update sort orders |
| `/api/chat/presets` | GET/POST/DELETE | Chat presets |
| `/api/chat/presets/:id` | GET/PUT/DELETE | Preset CRUD |
| `/api/chat/completions` | POST | Fire-and-forget completion (updates via SSE) |
| `/api/chat/cancel/:threadId` | POST | Abort in-flight completion |
| `/api/chat/tool-calls/:id/resume` | POST | Approve/deny pending tool call |
| `/api/chat/events` | GET | Global SSE event channel (never closes) |

## Model Proxy

| Route | Method | Description |
|-------|--------|-------------|
| `/api/proxy/status` | GET | Proxy status (enabled, port, running, healthy, error) |
| `/api/proxy/routes` | GET/DELETE | List/clear sticky routes |
| `/api/proxy/routes/:alias` | DELETE | Clear specific sticky route by alias |
| `/api/proxy/start` | POST | Start proxy server |
| `/api/proxy/stop` | POST | Stop proxy server |

## Hub

| Route | Method | Description |
|-------|--------|-------------|
| `/api/hub/search` | GET | Search HuggingFace models (q, sort, params_min, params_max) |
| `/api/hub/model/:author/:name` | GET | Model details |
| `/api/hub/download` | POST | Start download |
| `/api/hub/downloads` | GET | Active downloads |
| `/api/hub/downloads/:id/pause` | POST | Pause download |
| `/api/hub/downloads/:id/resume` | POST | Resume download |
| `/api/hub/downloads/:id/cancel` | POST | Cancel download |
| `/api/hub/downloads/history` | DELETE | Clear download history |

## Recipes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/recipes` | GET/POST | List/create recipes |
| `/api/recipes/:id` | GET/PUT/DELETE | Get/update/delete (built-in read-only) |
| `/api/recipes/:id/state` | GET | Get persisted recipe state (last inputs, last run) |
| `/api/recipes/:id/run` | POST | Run recipe with inputs |
| `/api/recipes/runs/active` | GET | Get active run (null if none) |
| `/api/recipes/runs/cancel` | POST | Cancel active run |

## Checkpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/checkpoints` | GET/POST | List checkpoints / Save checkpoint(s) |
| `/api/checkpoints/restore` | POST | Restore checkpoint/bundle |
| `/api/checkpoints/restore-mapped` | POST | Restore with explicit slot mapping |
| `/api/checkpoints/:id` | PUT/DELETE | Update name/notes / Delete checkpoint |

## MCP Config

| Route | Method | Description |
|-------|--------|-------------|
| `/api/mcp/config` | GET/PUT | Get/replace full mcp.json config |
| `/api/mcp/config/path` | GET | Config file path on disk |
| `/api/mcp/reload` | POST | Reconnect all servers from config |
| `/api/mcp/servers` | POST | Add server (name + entry in body) |
| `/api/mcp/servers/:name` | PUT/DELETE | Update/remove server |
| `/api/mcp/status` | GET | All server states |
| `/api/mcp/status/:name` | GET | Single server state |
| `/api/mcp/servers/:name/restart` | POST | Disconnect and reconnect |
| `/api/mcp/servers/:name/refresh` | POST | Same as restart (refreshes tool list) |
| `/api/mcp/permissions` | GET/PUT | All server + tool permissions |
| `/api/mcp/permissions/server/:name` | PUT | Set server permission |
| `/api/mcp/permissions/tool` | PUT | Set tool permission (enabled + approvalMode) |
| `/api/mcp/tool-calls/pending` | GET | Pending tool calls (need approval) |
| `/api/mcp/tool-calls/thread/:threadId` | GET | Tool calls for a thread |

## Update System

| Route | Method | Description |
|-------|--------|-------------|
| `/api/update/check` | GET | Check for updates (fetches remote release.json) |
| `/api/update/version` | GET | Get current version |

## Health

| Route | Method | Description |
|-------|--------|-------------|
| `/api/health` | GET | Health check |

## Access Tokens

| Route | Method | Description |
|-------|--------|-------------|
| `/api/tokens` | GET/POST | List/create API tokens |
| `/api/tokens/:id` | DELETE | Delete token |

## Summary

| Route | Method | Description |
|-------|--------|-------------|
| `/api/summary` | GET | App summary (server counts, proxy status, download counts) |
