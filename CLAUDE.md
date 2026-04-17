# Warpcore

Local LLM server manager. The engine room for WarpDrv.

## What This Is

Warpcore manages llama.cpp server instances across multiple GPU backends. It scans model directories, registers llama.cpp builds, and launches/stops/monitors llama-server processes. It does NOT handle inference-time params (temperature, samplers, etc.) — those come from the chat application connecting to the servers it spawns.

## Architecture

Monorepo with npm workspaces:

```
packages/
  shared/    @warpcore/shared   — Types, enums, VRAM calculator. No runtime deps.
  app/       @warpcore/app      — React 19 + Chakra UI v3 + Vite. Frontend with Zustand store.
  server/    @warpcore/server   — Express 5, REST endpoints, SSE broadcaster integration.
  bridge/    @warpcore/bridge   — Inference orchestration, MCP tools, message tree, SQLite persistence.
  desktop/   @warpcore/desktop  — Tauri v2 native shell. Tray icon, window management, server sidecar.
```

Frontend proxies `/api` to backend via Vite dev server config. No CORS needed in dev.

## Bridge Package (@warpcore/bridge)

Core inference orchestration layer between WarpCore and llama-server. Single source of truth for chat state.

### What Bridge Owns

- All message IDs (user, assistant, tool) — frontend never generates IDs
- Message tree structure via parentId references
- Thread lifecycle (auto-creates threads on first message)
- Inference orchestration (one pass = one assistant message)
- Tool call lifecycle (PENDING → EXECUTING → COMPLETED/DENIED/ERROR)
- Broadcasting all state changes via global SSE channel

### What Bridge Does NOT Do

- Handle inference-time params (temperature, samplers) — passed through from frontend
- Manage llama-server lifecycle — that's WarpCore's job
- Store non-chat data — uses WarpCore's JSON store for servers/models

### Architecture

**Orchestrator** (`packages/bridge/src/orchestrator/index.ts`):
- `handleCompletion()` — Entry point, auto-creates thread if needed
- `executePass()` — One inference pass, creates one assistant message
- `runPass()` — Streams to llama-server, persists parts, emits chunk events
- `resumeToolCall()` — Approve/deny tool, auto-triggers next pass when all resolved
- Recursive multi-pass: if tools auto-resolve, recursively calls `executePass()` with new assistant child of last tool message

**SqlitePersistence** (`packages/bridge/src/persistence/betterSqlite.ts`):
- IPersistence implementation with better-sqlite3
- Tables: threads, messages, message_parts, tool_calls, folders, thread_configs, mcp_server_permissions, mcp_tool_permissions
- Message tree via parentId, no ORDER BY (traverses chain)
- Foreign keys disabled for flexibility

**SseBroadcaster** (`packages/bridge/src/broadcaster/sseBroadcaster.ts`):
- IBridgeBroadcaster implementation with better-sse Channel
- HTTP sessions register via `getChannel().register(session)`
- In-process subscribers for local listeners
- All events fan-out to all connected clients

**McpClientManager** (`packages/bridge/src/mcp/client.ts`):
- IMcpClient for tool discovery and execution
- Manages MCP server connections (stdio/stdio transport)
- `getAllTools()`, `findToolServer()`, `executeToolCall()`

**PermissionManager** (`packages/bridge/src/permissions/index.ts`):
- IPermissions for tool approval policies
- `getToolApprovalMode(serverName, toolName)` → ALLOWED | ASK | DENIED
- `getEnabledTools()` filters out DENIED tools

### Event System

All state changes emit events via `broadcaster.emit()`. Frontend subscribes once to `/api/chat/events`, receives all events for all threads, filters by threadId in Zustand store.

**Event Types:**
- `thread.created/updated/deleted` — Thread lifecycle
- `message.created/patched/deleted` — Message lifecycle
- `message.chunk` — Streaming delta (optional to consume)
- `tool_call.created/updated` — Tool call lifecycle
- `inference.started/ended` — Inference state

**Checkpoint vs Progress Events:**
- Checkpoint events (`message.created`, `message.patched`) carry full authoritative state
- Progress events (`message.chunk`) carry streaming deltas for live typing
- Frontend can drop all chunks and still display correct state via checkpoints

### Message Tree Model

Messages form a tree via `parentId` references. Tool messages chain linearly, not as siblings:

```
assistant (pass 1)
  └── toolMsg(A)
        └── toolMsg(B)
              └── toolMsg(C)
                    └── assistant (pass 2, after all tools resolved)
```

Branching via regen/edit: new message with same `parentId` creates branch. `headMessageIdByThread` tracks current active branch in frontend store.

### Tool Call Lifecycle

1. Model emits tool calls → `tool_call.created` (PENDING)
2. If ASK: wait for user approval via `/api/chat/tool-calls/:id/resume`
3. If ALLOWED: auto-execute, emit `tool_call.updated` (EXECUTING)
4. MCP execution → `tool_call.updated` (COMPLETED/ERROR)
5. All sibling tools resolved → recursive `executePass()` with new assistant

## Running

```bash
npm install          # installs all workspaces
npm run dev          # runs both app (port 3000) and server (port 4400) via concurrently
npm run dev:server   # backend only
npm run dev:app      # frontend only
```

### Desktop (Tauri)

Requires Rust toolchain and system deps (libwebkit2gtk-4.1-dev, libgtk-3-dev, libayatana-appindicator3-dev, librsvg2-dev on Ubuntu).

```bash
# Start server + app first
npm run dev
# Then in another terminal
cd packages/desktop && npx tauri dev
```

For release builds:

```bash
./release.sh
```

VSCode: Use "warpcore-all (single terminal)" launch config for debugging both server and app.

## Tech Stack

- React 19, TypeScript, Chakra UI v3, Vite, React Router, Lucide icons
- Node.js, Express 5, better-sqlite3, tsx
- @warpcore/bridge for inference orchestration and MCP tool execution
- better-sse for real-time event broadcasting to all connected clients
- Tauri v2 (Rust) for desktop wrapper, tray icon, server lifecycle
- GGUF binary header parser (custom, reads metadata without loading full file)
- VRAM estimation using oobabooga's regression formula
- @huggingface/hub for HF API (model search, file listing)
- node-downloader-helper for model downloads (pause/resume/progress)
- markdown-to-jsx + DOMPurify for README rendering
- @assistant-ui/react with useExternalStoreRuntime for chat UI
- Zustand for frontend state management, mirrors Bridge events
- @modelcontextprotocol/sdk for MCP server connections and tool execution

## Key Design Decisions

- Shared types are the contract — app and server both import from @warpcore/shared
- Server processes are spawned detached — they survive if the UI restarts
- PIDs are tracked in the JSON store and reconciled on startup
- Models are scanned from configurable root dirs following user/model folder structure (HuggingFace layout)
- Multi-shard GGUFs auto-detected by `-NNNNN-of-NNNNN.gguf` pattern
- mmproj files auto-detected by `mmproj` in filename
- VRAM calculator runs client-side for instant feedback, uses formula from <https://oobabooga.github.io/blog/posts/gguf-vram-formula/>
- Data stored in `~/.config/warpcore/warpcore-data.json` (platform-appropriate config dir)
- Schema migrations run on startup — numbered functions, never delete user data, only transform

## Chat Feature

Full-featured chat interface powered by Bridge orchestrator. Frontend is a dumb client that mirrors Bridge events into Zustand store.

### Stack

- **Backend:** @warpcore/bridge orchestrator, better-sqlite3, better-sse
- **Frontend:** Zustand store, @assistant-ui/react with useExternalStoreRuntime
- **MCP:** @modelcontextprotocol/sdk for tool execution
- **SSE:** Global event channel at `/api/chat/events`, single connection per client

### Architectural Pattern: Dumb Frontend

Frontend never:
- Generates message IDs — Bridge owns all IDs
- Optimistically updates state — only changes via SSE events
- Decides message tree structure — Bridge dictates parent-child relationships
- Filters tool messages — they're part of the chain, converted for display

Frontend does:
- Subscribe to Bridge SSE channel at app start (`/api/chat/events`)
- Mirror Bridge events into Zustand store via apply* actions
- Trigger actions via POST endpoints (completions, cancel, tool approval)
- Render from Zustand store via assistant-ui's useExternalStoreRuntime

### Backend Architecture

**Orchestrator Flow:**

1. Frontend POSTs `/api/chat/completions` with `threadId`, `messages`, `systemPrompt`, `inferenceParams`
2. Route tracks `AbortController` per thread, aborts previous if in-flight
3. Orchestrator auto-creates thread if not exists, emits `thread.created`
4. If `userMessage` provided: Bridge generates ID, saves, emits `message.created`
5. `executePass()` creates assistant message, emits `inference.started`
6. `runPass()` streams to llama-server:
   - Emits `message.patched` for each new part (text/reasoning)
   - Emits `message.chunk` for streaming deltas (optional)
   - On tool calls: `tool_call.created` + `message.patched` (assistant gets tool_call part)
7. Tool messages chain linearly: each tool message's parent = previous tool message
8. If tools need approval (ASK): emit `inference.ended`, wait for resume
9. If tools auto-resolve: recursively call `executePass()` with new assistant child of last tool
10. Final checkpoint: `message.patched` with full parts + stats, then `inference.ended`

**Tool Approval Flow:**

1. User clicks approve/deny in ToolCallBlock
2. Frontend POSTs `/api/chat/tool-calls/:id/resume` with `decision`, `threadId`, `messages`
3. Orchestrator `resumeToolCall()`:
   - Update tool call status (DENIED or EXECUTING → COMPLETED/ERROR)
   - Emit `tool_call.updated`
   - Walk tool message chain, check if all siblings resolved
   - If all resolved: `executePass()` with new assistant child of tool message
   - If still pending: wait for more approvals

**SSE Broadcaster:**

- `GET /api/chat/events` — Opens SSE session, registers on broadcaster Channel
- Session never closes normally, closes on client disconnect
- All Bridge events fan-out to all registered sessions
- Frontend filters events by `threadId` in Zustand store

### Frontend Architecture

**Zustand Store** (`packages/app/src/store/index.ts`):

Bridge slice from `@warpcore/bridge/client`:
```typescript
{
  threads: Record<TThreadId, IChatThread>,
  messagesByThread: Record<TThreadId, Record<TMessageId, IChatMessage>>,
  headMessageIdByThread: Record<TThreadId, TMessageId>,
  toolCallsById: Record<TToolCallId, IToolCall>,
  isRunningByThread: Record<TThreadId, boolean>,
  
  // Actions (called by SSE subscriber)
  applyThreadCreated, applyThreadUpdated, applyThreadDeleted,
  applyMessageCreated, applyMessagePatched, applyMessageDeleted,
  applyMessageChunk,
  applyToolCallCreated, applyToolCallUpdated,
  applyInferenceStarted, applyInferenceEnded,
  
  // Initial seeding from API fetch
  seedThreadMessages,
  
  // Current chat context
  currentThreadId, currentServerId, currentSystemPrompt, currentInferenceParams,
}
```

**SSE Subscriber** (`packages/app/src/store/slices/sseHandlers.ts`):

- Opens single `EventSource('/api/chat/events')` at app start
- Registers per-event-type listeners (`message.created`, `tool_call.updated`, etc.)
- Each listener calls corresponding `apply*` action with event payload
- Auto-reconnects on error (EventSource default behavior)

**Message Conversion** (`packages/app/src/hooks/useChatSelectors.ts`):

`useDerivedMsgsForUI(threadMessages, currentThreadId, headMessageId)`:
- Converts Bridge `IChatMessage` → assistant-ui `ThreadMessage` format
- Converts TOOL role messages to ASSISTANT with empty content (for display)
- Converts TOOL_CALL parts to assistant-ui tool-call format with live status
- Builds `ExportedMessageRepository` with explicit `parentId` for branching support
- Returns `{ messages: [...], headId: "..." }` for `useExternalStoreRuntime`

Key pattern: Messages sorted by `createdAt`, repository uses explicit `parentId` (not positional) so assistant-ui reconstructs correct tree with branches.

**Chat Page** (`packages/app/src/pages/ChatPage.tsx`):

- `useExternalStoreRuntime` with `messageRepository` from hook
- `onNew`: POST `/api/chat/completions` with user message, fire-and-forget
- `onReload`: POST `/api/chat/completions` with `parentId` for regen, no user message
- `onCancel`: POST `/api/chat/cancel/:threadId` to abort in-flight
- `setMessages`: Called by assistant-ui on branch switch, updates `headMessageIdByThread`
- Initial load: Fetch thread + tool calls, seed store with `seedThreadMessages`

**Tool Call Display** (`packages/app/src/components/ToolCallBlock.tsx`):

- Status indicators: PENDING (amber dot), EXECUTING (spinner + "Running"), COMPLETED (checkmark), DENIED (ban icon + "Denied"), ERROR (alert + "Error")
- Approve/Deny buttons for PENDING state
- Collapsible arguments/result panels
- `ToolCallBlockWrapper` reads actual status from `toolCallsById` store (not assistant-ui status)

### Chat API Routes

```
# Threads
GET/POST         /api/chat/threads              — List/create threads
GET/PUT/DELETE   /api/chat/threads/:id          — Get/update/delete thread
GET/PUT          /api/chat/threads/:id/config   — Thread config (system prompt, params)

# Messages
GET/POST         /api/chat/threads/:id/messages — Get/create messages (bulk seed)
PUT/DELETE       /api/chat/messages/:id         — Edit/delete message parts

# Folders
GET/POST         /api/chat/folders              — List/create folders
PUT/DELETE       /api/chat/folders/:id          — Update/delete folder
PUT              /api/chat/folders/reorder      — Batch update sort orders

# Presets
GET/POST/DELETE  /api/chat/presets              — List/create/delete presets
GET/PUT/DELETE   /api/chat/presets/:id          — Get/update preset

# Inference
POST             /api/chat/completions          — Fire-and-forget, updates via SSE
POST             /api/chat/cancel/:threadId     — Abort in-flight completion

# Tool Calls
POST             /api/chat/tool-calls/:id/resume — Approve/deny pending tool

# Real-time
GET              /api/chat/events               — Global SSE event channel (never closes)
```

### Key Files

**Backend:**
- `packages/bridge/src/orchestrator/index.ts` — Core inference orchestration (770 lines)
- `packages/bridge/src/persistence/betterSqlite.ts` — SQLite persistence (467 lines)
- `packages/bridge/src/broadcaster/sseBroadcaster.ts` — SSE fan-out
- `packages/bridge/src/mcp/client.ts` — MCP tool execution
- `packages/bridge/src/permissions/index.ts` — Tool approval policies
- `packages/bridge/src/parser.ts` — SSE parsing from llama-server
- `packages/server/src/routes/chat.ts` — REST + SSE endpoints (447 lines)

**Frontend:**
- `packages/app/src/pages/ChatPage.tsx` — Main chat UI with assistant-ui (438 lines)
- `packages/app/src/hooks/useChatSelectors.ts` — Message conversion, repository building (185 lines)
- `packages/app/src/store/index.ts` — Zustand store with Bridge slice (84 lines)
- `packages/app/src/store/slices/sseHandlers.ts` — SSE event handlers
- `packages/app/src/components/assistant-ui/ToolCallBlockWrapper.tsx` — Tool call status mapping
- `packages/app/src/components/ToolCallBlock.tsx` — Tool call display with approve/deny

### Important Patterns

**Fire-and-Forget Completions:**

Frontend POSTs `/api/chat/completions`, route returns `{ok: true}` immediately. All updates flow via SSE. Frontend waits for `message.created` + `inference.started` events, not HTTP response.

**Abort on New Request:**

Route tracks `AbortController` per thread in `activeAborts` Map. New completion for same thread aborts previous. `orchestrator.handleCompletion()` checks `abortSignal.aborted` throughout.

**MessageRepository for Branching:**

`useDerivedMsgsForUI` builds `ExportedMessageRepository` with explicit `parentId` (not positional). Assistant-ui's `import()` method respects explicit parentIds, reconstructs correct tree with branches. `headId` sets initial active branch.

**Tool Message Chaining:**

Tool messages chain linearly: `assistant → tool(A) → tool(B) → tool(C) → next assistant`. NOT siblings. Preserves single canonical message order, avoids branching for semantically one turn.

**Checkpoint + Streaming:**

`message.patched` with `addParts` declares new part with empty text. `message.chunk` streams deltas. Final `message.patched` with `replaceParts` + `stats` is authoritative checkpoint. Frontend can drop chunks, still correct via checkpoint.

**No Optimistic Updates:**

Frontend never updates state before SSE event. User action (submit, approve) POSTs to Bridge, waits for event. This ensures single source of truth, no race conditions.

## Desktop (Tauri)

The Tauri package is a thin native shell around the web app:

- Spawns the Node.js server as a child process on launch
- Checks if server is already running before spawning
- Health monitor polls server every 3s, auto-respawns if it dies, reloads webview on recovery
- Tray icon with Open/Hide/Restart Server/Quit menu
- Left-click tray toggles window visibility
- Close button hides to tray instead of quitting
- Quit kills the server child process and exits
- Emits `server-status` events (disconnected/connected/failed) for frontend overlay

### Building for Release

```bash
./release.sh              # builds deb only (default)
./release.sh deb          # same as above, explicit
./release.sh appimage     # AppImage only
./release.sh deb appimage # both deb and AppImage
```

The script accepts bundle format names as positional arguments passed to `npx tauri build --bundles`. With no arguments it defaults to `deb` only because AppImage takes a long time to build. To add more formats, pass any format that Tauri's `--bundles` flag supports (e.g. `deb`, `appimage`, `rpm`, `dmg`, `msi`, `nsis`, `updater`).

Artifacts land in `packages/desktop/target/release/bundle/`. Upload to GitHub Releases manually.

## Update System

No auto-updater or signing keys. Simple version check:

- `release.json` at repo root defines current version, update check URL, and download page URL
- Server exposes `GET /api/update/check` which fetches remote `release.json` and compares semver
- Frontend shows a dismissable blue banner when a newer version is available
- User clicks "Download" which opens the GitHub Releases page in the system browser
- Update is manual: download new AppImage/deb, replace old one. Config data in `~/.config/warpcore/` is preserved
- Migration runner handles any schema changes on next startup

### Release Workflow

1. Run `./release.sh` (or `./release.sh deb appimage` for both formats) — bumps version in release.json, tauri.conf.json, package.json, builds everything
2. Test the build locally
3. Create GitHub release tagged with the version
4. Upload artifacts to the release
5. Push release.json to main branch (triggers update check for running instances)

## Model Proxy

OpenAI-compatible API that routes requests to backend llama-server instances by model alias:

- Runs on configurable port (default 1234) via `proxyPort` in settings
- Enabled/disabled via `proxyEnabled` flag in settings
- Exposes OpenAI-compatible `/v1/*` endpoints
- `GET /v1/models` lists all registered aliases across all servers
- Requests routed by `model` field in POST body (e.g., `{"model": "alias-name", ...}`)
- **Sticky routing:** Once an alias resolves to a server, it sticks to that server until it stops
- If sticky server dies, route clears and next request picks another running server with same alias
- If no server with alias is running, returns 503; if alias doesn't exist, returns 404 with available aliases
- Streams responses directly from llama-server (supports streaming completions)
- Error handling: 502 if target server not responding, clears sticky route on failure

### Proxy API Routes

```
GET    /api/proxy/status        — Proxy status (enabled, port, running, healthy, error)
GET/DELETE /api/proxy/routes    — List/clear sticky routes
DELETE /api/proxy/routes/:alias — Clear specific sticky route by alias
POST   /api/proxy/start         — Start proxy server
POST   /api/proxy/stop          — Stop proxy server
```

### Proxy Request Flow

1. Client sends request to `http://localhost:{proxyPort}/v1/chat/completions` with `{"model": "my-alias", ...}`
2. Proxy extracts `model` field from request body
3. Checks sticky route map for alias → serverId mapping
4. If sticky exists and server running, use it; otherwise find first healthy running server with that alias
5. Sets sticky route for future requests
6. Forwards request to `http://127.0.0.1:{serverPort}/v1/chat/completions`
7. Streams response directly back to client

### Hub API Routes

```
GET    /api/hub/search?q=&sort=&params_min=&params_max= — Search models
GET    /api/hub/model/:author/:name                     — Model details
POST   /api/hub/download                                — Start download
GET    /api/hub/downloads                               — Active downloads
POST   /api/hub/downloads/:id/pause/resume/cancel       — Download control
DELETE /api/hub/downloads/history                       — Clear history
```

Browse and download GGUF models from HuggingFace:

- Fuzzy search across model name and author
- Sort by downloads, likes, recently updated, recently created
- Param range filter (min/max billions)
- Model detail panel with stats, tags, GGUF file list, rendered README
- Download GGUF files to configured model directories with auto-created user/model folder structure
- Dir picker when multiple model roots configured, hints which root already has files from same repo
- Download manager panel with progress bars, speed, ETA, pause/resume/cancel
- Checkmark badge on already-downloaded files (checked across all model roots, persists across sessions)
- Requires at least one model directory configured — shows guard screen otherwise

## Recipes

Automated bash script pipelines — define reusable workflows with typed inputs and sequential step execution.

### What It Does

- **Define** bash scripts with structured metadata (inputs as env vars, sequential steps)
- **Run** recipes from the UI with typed input forms (text, number, toggle, dropdown)
- **Monitor** real-time step execution with stdout/stderr streaming via SSE
- **Cancel** running recipes (one-at-a-time execution enforced)

### Recipe Syntax

Plain bash scripts with two directive types:

**Input directives** (`#!input NAME type [key=value ...]`):
- Must appear before any `#!step` directives
- Types: `STRING`, `NUMBER`, `BOOL`, `CHOICE` (with `options=a,b,c`)
- Options: `default=...`, `description=...`

**Step directives** (`#!step Step Name [cwd=path]`):
- Followed by bash commands on subsequent lines
- `cwd=path` sets working directory (supports `~` and `$HOME`)

**Example:**
```bash
#!input MODEL_NAME string description="Model filename"
#!input THREADS number default=4
#!input QUANT bool default=true

#!step Checkout
git clone https://github.com/user/repo.git

#!step Build [cwd=./repo]
make -j$THREADS

#!step Quantize
./quantize repo.gguf repo-q4.gguf && echo "Done"
```

### Architecture

**Parser** (`packages/shared/src/recipeParser.ts`):
- Validates directives at creation/edit time
- Checks input ordering (must precede steps), no duplicate names, required fields
- Throws on invalid syntax with line-specific error messages

**Store** (`packages/server/src/services/recipeStore.ts`):
- Recipes stored under `recipe:{id}` in WarpCore JSON store
- Per-recipe state (last inputs, last run status) under `recipeState:{id}`

**Runner** (`packages/server/src/services/recipeRunner.ts`):
- Sequential step execution (one at a time, in order)
- Spawns bash subprocess per step with inputs as environment variables
- Passes `CONTROL_API_PORT` to enable recipe steps to interact with running llama-servers
- Streams stdout/stderr via SSE per step
- Single-run mutual exclusion: only one run active at a time
- `cancelRun()` sends SIGKILL (POSIX) or taskkill (Windows)

**Frontend** (`packages/app/src/pages/RecipesPage.tsx`):
- Recipe list with CRUD operations (built-in recipes are read-only)
- `RecipeEditorDialog`: create/edit with syntax validation
- `RunRecipeDialog`: input form + live step monitoring with output terminal
- Active run banner with monitor/cancel buttons
- Shared across all connected clients via SSE

### SSE Events

| Channel | Payload |
|---------|---------|
| `recipes:init` | `{ recipes: Record<TRecipeId, IRecipe>, activeRun: IRecipeRunState | null }` |
| `recipes:update` | `IRecipe` (created or updated) |
| `recipes:delete` | `IRecipe` (deleted) |
| `runs:started` | `IRecipeRunState` (all steps PENDING) |
| `runs:step-started` | `{ runId, stepId, startedAt }` |
| `runs:step-output` | `{ runId, stepId, kind: STDOUT\|STDERR, data: string }` |
| `runs:step-finished` | `{ runId, stepId, status, exitCode, finishedAt }` |
| `runs:finished` | `{ runId, status, finishedAt }` |

### Store Slice

```typescript
{
  recipes: Record<TRecipeId, IRecipe>,
  activeRun: IRecipeRunState | null,
  stepOutputs: Record<TStepId, string>,
}
```

### API Routes

```
GET/POST    /api/recipes                    — List/create recipes
GET         /api/recipes/:id                — Get recipe
PUT/DELETE  /api/recipes/:id                — Update/delete (built-in read-only)
GET         /api/recipes/:id/state          — Get persisted recipe state
POST        /api/recipes/:id/run            — Run recipe with inputs
GET         /api/recipes/runs/active        — Get active run (null if none)
POST        /api/recipes/runs/cancel        — Cancel active run
```

### Key Design Decisions

- **Sequential execution**: Steps run in order; failure stops the pipeline (remaining steps marked SKIPPED)
- **One-at-a-time**: Only one recipe runs across the entire app (prevents resource contention)
- **Env injection**: Inputs become environment variables — the primary inter-step communication mechanism
- **No sandboxing**: Recipes are raw bash, no build step or compilation
- **Built-in vs custom**: `isBuiltIn` flag protects bundled recipes; custom recipes fully editable/deletable
- **State persistence**: Last-used inputs and run results auto-populate on next run

## Attachments

Image and file attachments in chat — drag-and-drop, preview, and multi-modal message support.

### What It Does

- Attach images and files to chat messages via composer or drag-and-drop
- Images displayed as thumbnails with full-size preview dialog on click
- Non-image files shown as file icon tiles
- Files base64-encoded and sent inline with completion requests
- Client-side file validation (type, size, blocked extensions)

### Supported Types

**Allowed MIME types:** `image/*`, `application/pdf`, `text/*`, `application/json`, `application/*`

**Blocked extensions:** executables (`.exe`, `.bat`, `.sh`, etc.), archives (`.zip`, `.tar.gz`, etc.), system binaries (`.dll`, `.so`, etc.)

**Code files:** explicitly whitelisted despite extensions (`.js`, `.ts`, `.py`, `.md`, `.json`, etc.)

**Size limit:** 10 MB per file

### Architecture

**File Reader Hook** (`packages/app/src/hooks/useFileReader.ts`):
- `readFile(file)` — reads file → `IMessagePartAttachment` with base64 data
- `extractTextFromFile(file)` — extracts text (plain text, code, or PDF via pdfjs-dist)

**Attachment Adapter** (`packages/app/src/pages/ChatPage.tsx`):
- `accept: '*'` — accepts all file types (further validated in send)
- `add()` — creates attachment object with File reference, type inferred from MIME
- `send()` — converts File to base64 data URL for assistant-ui

**Send Flow:**
1. User selects/drops files in composer
2. `attachmentAdapter.add()` creates attachment objects
3. On send: each attachment read as base64 via FileReader
4. Construct `attachment` part: `{ id, type: 'attachment', data, mimeType, fileName, fileSize }`
5. Appended to `body.attachments` in completion request

**Message Conversion** (`packages/app/src/hooks/useChatSelectors.ts`):
- `ATTACHMENT` parts with `image/` MIME → decoded to File object, displayed as `type: 'image'`
- Non-image attachments → `null` in content (shown as separate attachment tile)
- Attachments collected and passed to assistant-ui via `attachments` field

**UI Components** (`packages/app/src/components/assistant-ui/attachment.tsx`):
- `AttachmentUI` — thumbnail/preview tile, tooltip with filename
- `AttachmentThumb` — avatar-based thumbnail (image preview or FileText fallback)
- `AttachmentPreviewDialog` — dialog on tile click, up to 80vh max image size
- `AttachmentRemove` — X button for composer-only attachments
- `UserMessageAttachments` — renders in user messages (right-aligned)
- `ComposerAttachments` — renders in composer
- `ComposerAddAttachment` — "+" button triggering file picker

### API Routes

No dedicated API routes — attachments are sent inline with existing `/api/chat/completions` POST body.

### Data Model

**Sent format (body.attachments):**
```json
{ "id": "file.png-1234567890", "type": "attachment", "data": "iVBORw0...", "mimeType": "image/png", "fileName": "screenshot.png", "fileSize": 245678 }
```

**Stored format (message_parts):** Same structure, persisted in SQLite.

**Display format (ThreadMessage.attachments):**
```json
{ "id": "...", "type": "image", "content": [{ "type": "image", "image": "data:image/png;base64,...", "filename": "..." }], "file": File { ... } }
```

### Key Design Decisions

- **Client-side only**: No server-side file processing or storage
- **No file persistence**: Files stored as base64 in message_parts, not on disk
- **Image preview special case**: Images get thumbnail tiles with full-size dialog; non-image files get generic icon tiles
- **Dual validation**: Both MIME type and file extension checked
- **10MB limit**: Enforced at read time before base64 encoding
- **No upload progress**: Files are local, read synchronously via FileReader

## MCP Server Config

Manage Model Context Protocol servers — configure stdio and HTTP servers, monitor connection status, and control permissions.

### What It Does

- **Configure** MCP servers via Cursor-compatible `mcp.json` file
- **Manage** server lifecycle: connect, disconnect, restart, refresh tool list
- **Monitor** real-time server connection status and discovered tools
- **Control** permissions: per-server enable/disable, per-tool approval mode

### Configuration File

**Location:** `~/.config/warpcore/mcp.json` (platform-specific, see `GET /api/mcp/config/path`)

**Format:** Cursor-compatible JSON:
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

**Transport types:**
- **stdio** (default): `command` + `args` run server as subprocess
- **HTTP**: `url` points to external server, optional `headers` for auth

**Server entry fields:** `command?`, `args?`, `env?`, `url?`, `headers?`, `timeout?`

### Architecture

**Config Service** (`packages/server/src/util/mcpConfig.ts`):
- `readMcpConfig()` / `writeMcpConfig()` — read/write mcp.json with pretty-printing
- `addMcpServer()` / `removeMcpServer()` / `updateMcpServer()` — CRUD on server entries
- `getMcpConfigPath()` — platform-specific config path

**Routes** (`packages/server/src/routes/mcp.ts`):
- Uses Bridge's `mcpClient` for server lifecycle
- Uses Bridge's `persistence` for permissions storage

### Config API Routes

```
GET/PUT     /api/mcp/config           — Get/replace full config
GET         /api/mcp/config/path      — Config file path on disk
POST        /api/mcp/reload           — Reconnect all servers from config
```

### Server CRUD Routes

```
POST        /api/mcp/servers          — Add server (name + entry in body)
PUT         /api/mcp/servers/:name    — Update server entry
DELETE      /api/mcp/servers/:name    — Remove server (disconnects if connected)
```

### Server Lifecycle Routes

```
GET         /api/mcp/status           — All server states
GET         /api/mcp/status/:name     — Single server state
POST        /api/mcp/servers/:name/restart   — Disconnect and reconnect
POST        /api/mcp/servers/:name/refresh   — Same as restart (refreshes tool list)
```

### Permissions Routes

```
GET         /api/mcp/permissions      — All server + tool permissions
PUT         /api/mcp/permissions/server/:name — Set server permission (enabled/disabled)
PUT         /api/mcp/permissions/tool         — Set tool permission (enabled + approvalMode)
```

### Tool Call Queries

```
GET         /api/mcp/tool-calls/pending           — Pending tool calls (need approval)
GET         /api/mcp/tool-calls/thread/:threadId  — Tool calls for a thread
```

### Server States

Each server tracks: `connected` (boolean), `lastConnectError` (string|null), `lastToolRefresh` (number|null), `tools` (IToolInfo[])

### Config Write Flow

1. Client calls config or server CRUD endpoint
2. Server updates `mcp.json` via `writeMcpConfig()`
3. On add/update: calls `mcpClient.connect(name, entry)` to start server
4. On remove: calls `mcpClient.disconnect(name)` to stop server
5. On bulk replace: iterates all entries, calls `connect()` for each

### Reload Flow

1. Client calls `POST /api/mcp/reload`
2. Server reads current config
3. Iterates all server entries, calls `mcpClient.reconnect(name)` for each

### Key Design Decisions

- **Cursor-compatible format**: Same `mcp.json` schema as Cursor editor for cross-editor compatibility
- **File-based config**: Written to disk immediately, not stored in WarpCore JSON store or SQLite
- **Config path endpoint**: Frontend can display config location to user
- **Separation of concerns**: Config management (`routes/mcp.ts`) separate from execution (`packages/bridge/src/mcp/client.ts`)
- **Permissions in SQLite**: Uses Bridge's persistence for consistency with chat tool approval flow
- **Restart = Refresh**: Both endpoints call `mcpClient.reconnect()`

## Checkpoint Feature

Save and restore llama-server slot KV cache states for conversation resumption.

### What It Does

- **Save checkpoints:** Persist slot KV cache to disk (.bin files with JSON sidecars)
- **Restore checkpoints:** Load saved KV cache into running server slots
- **Bundle support:** Group multiple slot checkpoints together for multi-slot servers
- **Auto-save/load:** Optional per-server auto-save on stop, auto-load on start
- **Fingerprint validation:** Ensure checkpoints match target server's model
- **Disk cap enforcement:** Configurable storage limit (default 50GB)

### Architecture

**Checkpoint Service** (`packages/server/src/services/checkpointService.ts`):
- `saveCheckpoint()` — Trigger llama-server slot save, create sidecar metadata
- `restoreCheckpoint()` — Validate fingerprint, restore single checkpoint or bundle
- `restoreCheckpointsMapped()` — Explicit checkpoint-to-slot mapping
- `listCheckpoints()` — Scan checkpoints directory, filter by serverId
- `deleteCheckpoint()` — Remove .bin and .json files
- `updateCheckpoint()` — Edit name/notes in sidecar

**Slot State Tracker** (`packages/server/src/services/slotStateTracker.ts`):
- `bootstrapServer()` — Read /slots API on server start, seed state
- `teardownServer()` — Clear state on server stop
- `parseLogLine()` — Extract slot events from llama-server logs
- Real-time slot monitoring via log parsing (launch_slot_, update_slots, process_token, release)
- SSE emission on state changes

**Data Storage:**
- Checkpoints stored in configurable directory (default: `~/.config/warpcore/checkpoints/`)
- Each checkpoint: `<id>.bin` (KV cache binary) + `<id>.json` (metadata sidecar)
- Sidecar contains: id, bundleId, serverId, slotIndex, fingerprint, sizeBytes, tokens, createdAt

### Key Concepts

**Checkpoint ID Format:**
```
<fingerprintHash>-<timestamp>-<slotIndex>
Example: a1b2c3d4e5f67890-1704067200000-0
```

**Bundle Model:**
- Multiple slots saved together share a `bundleId`
- Restoring a bundle restores all slots in order (slotIndex 0→N)
- Single-slot checkpoints have `bundleId: null`

**Fingerprint Validation:**
- Computed from model filename + file size (SHA-256, first 16 chars)
- Prevents restoring checkpoints from wrong model
- Returns error with mismatch details if validation fails

**Slot State Tracking:**
- Parsed from llama-server logs (not API polling)
- Tracks: isProcessing, taskId, promptTokens, generatedTokens, cachedTokens, prefillProgress
- Emits `slot:state` SSE events on changes
- Snapshots emitted on connect via `server:slots-snapshot`

### Save Modes

**Per-Slot Selection:**
- `ALL` — Save all slots as bundle
- `LATEST` — Save most recently active slot
- `LARGEST` — Save slot with most cached tokens
- `SLOT` — Manually select specific slot

**Replace vs New:**
- `REPLACE_LATEST` — Delete existing latest bundle, save new one
- `NEW` — Create new checkpoint/bundle with custom name

### Auto-Save/Load

Configurable per-server in LaunchServerDialog:
- **autoSaveCheckpointOnStop:** Save all slots as bundle before server stop
- **autoLoadCheckpointOnStart:** Load latest compatible checkpoint after server ready

Implemented in `processManager.ts`:
- `maybeAutoSaveCheckpoint()` — Called at start of `killServer()`
- `maybeAutoLoadCheckpoint()` — Called after `bootstrapServer()` in health check

### SSE Events

**Channels:**
- `slot:state` — Single slot state update
- `slot:metadata` — Slot metadata (message count, preview)
- `server:slots-snapshot` — Full server slot state (on-connect or live)
- `checkpoint:created` — New checkpoint saved
- `checkpoint:updated` — Checkpoint metadata edited
- `checkpoint:deleted` — Checkpoint removed
- `checkpoint:restored` — Restore operation completed
- `checkpoints:init` — Initial checkpoint list (on-connect)

### API Routes

```
# Checkpoint Management
GET    /api/checkpoints?serverId=...&threadId=... — List checkpoints
POST   /api/checkpoints                           — Save checkpoint(s)
POST   /api/checkpoints/restore                   — Restore checkpoint/bundle
POST   /api/checkpoints/restore-mapped            — Restore with explicit mapping
PUT    /api/checkpoints/:id                       — Update name/notes
DELETE /api/checkpoints/:id                       — Delete checkpoint
```

### Frontend Components

**Dialogs:**
- `SaveCheckpointDialog` — Slot selection, replace/new tabs, bundle deletion
- `LoadCheckpointDialog` — Filter (THIS_SERVER/ALL_COMPATIBLE), bundle grouping, slot mapping

**Page:**
- `CheckpointsPage` — Search, sort, bundle grouping, inline rename, delete

**Slot Monitoring:**
- `SlotPill` — Real-time slot status badge (idle/processing, tokens)
- Integrated into ServersPage server cards

### Settings

**Global (SettingsPage):**
- `checkpointsPath` — Custom checkpoint directory (default: `~/.config/warpcore/checkpoints`)
- `maxCheckpointDiskGB` — Storage cap in GB (default: 50, 0 = unlimited)

**Per-Server (LaunchServerDialog):**
- `autoSaveCheckpointOnStop` — Auto-save all slots on stop
- `autoLoadCheckpointOnStart` — Auto-load latest on start

### Important Patterns

**Bundle Restoration:**
- Bundle checkpoints restored in slotIndex order (0→N)
- Target server must have ≥ bundle size slots
- All checkpoints in bundle share same fingerprint

**Explicit Mapping:**
- `restoreCheckpointsMapped()` allows arbitrary checkpoint→slot assignments
- Useful for restoring specific slots without full bundle
- Validates no duplicate target slots

**Fingerprint Mismatch Handling:**
- Returns `{ success: false, fingerprintMismatches: [...] }`
- Does NOT attempt restore if fingerprint doesn't match
- Shows detailed error to user (expected vs actual filename/size)

**Disk Cap Enforcement:**
- Checked before save operation
- Throws error if at/over cap: "Checkpoint disk cap reached (X GB). Delete old checkpoints before saving."
- Cap includes all checkpoints (all servers, all models)

## TypeScript Conventions

- Use Hard tab width 4 for coding, not space, only tabs. IMPORTANT
- Do NOT use sed command for editing files due to risk of bad edits and breaking code syntax.
- use prefixes for type declarations - `I` prefix for interfaces, `T` for types, `E` for enums
- `Record<>` instead of `Map`
- Named types for IDs: `TBackendId`, `TServerId`, etc.
- Enum values in UPPER_SNAKE_CASE
- `//` style comments only, no jsdoc
- Single-line sub blocks on same line as if/for
- No explicit type-casting, no `any`

## API Routes

**WarpCore Management:**

```
GET/PUT          /api/settings          — App settings (model dirs, proxy config)
GET/POST         /api/backends          — Llama.cpp builds
GET/PUT/DELETE   /api/backends/:id      — Backend CRUD
POST             /api/backends/:id/validate — Validate backend path
GET              /api/models            — Scanned GGUF models
POST             /api/models/scan       — Rescan model directories
GET/POST         /api/servers           — Llama-server instances
POST             /api/servers/:id/stop  — Stop server
POST             /api/servers/:id/restart — Restart server
DELETE           /api/servers/:id       — Delete server config
GET/DELETE       /api/servers/:id/logs  — Get/clear server logs
GET/POST/DELETE  /api/presets           — Inference param presets (legacy)
GET              /api/update/check      — Check for updates
GET              /api/update/version    — Get current version
GET              /api/health            — Health check
```

**Chat:** See Chat Feature section above.

## Data Persistence

**WarpCore Config** (`~/.config/warpcore/warpcore-data.json`):

Keys are namespaced in a single JSON file:
```
settings:general    — ISettings (model dirs, proxy config, etc.)
backends:{id}       — IBackend (llama.cpp builds)
servers:{id}        — IServer (running llama-server instances)
presets:{id}        — IPreset (inference param presets)
downloads:{id}      — IDownload (model download history)
_schemaVersion      — number (migration tracking)
```

**Chat Data** (`~/.config/warpcore/chat.db`):

SQLite database via better-sqlite3. Bridge schema:

- `threads` — Chat threads with metadata (title, folderId, systemPrompt, token counts)
- `messages` — Message tree (id, parentId, threadId, role, stats, createdAt)
- `message_parts` — Message content parts (id, messageId, type, orderIndex, text, toolCallId)
- `tool_calls` — MCP tool execution records (id, messageId, threadId, serverName, toolName, arguments, result, status, error)
- `folders` — Thread organization (id, name, parentId, sortOrder)
- `thread_configs` — Per-thread config (threadId, presetId, systemPrompt, params JSON)
- `mcp_server_permissions` — Server-level tool policies (serverName, mode: ALLOWED/ASK/DENIED)
- `mcp_tool_permissions` — Per-tool approval mode (serverName, toolName, mode)

WAL mode enabled, foreign keys disabled for flexibility. No `ORDER BY createdAt` in message fetch — traverses parentId chain instead.

**Chat Presets** (`~/.config/warpcore/chat-presets.json`):

JSON file service (not SQLite) for inference parameter presets. Separate from thread configs.
