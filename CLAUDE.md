# Warpcore

Local LLM server manager. The engine room for WarpDrv.

## What This Is

Warpcore manages llama.cpp server instances across multiple GPU backends. It scans model directories, registers llama.cpp builds, and launches/stops/monitors llama-server processes. It does NOT handle inference-time params (temperature, samplers, etc.) — those come from the chat application connecting to the servers it spawns.

## Architecture

Monorepo with npm workspaces:

```
packages/
  shared/    @warpcore/shared   — Types, enums, VRAM calculator. No runtime deps.
  app/       @warpcore/app      — React 19 + Chakra UI v3 + Vite. Dark mode AI-app aesthetic.
  server/    @warpcore/server   — Express 5 + JSON file store. Process management, GGUF parsing.
  desktop/   @warpcore/desktop  — Tauri v2 native shell. Tray icon, window management, server sidecar.
```

Frontend proxies `/api` to backend via Vite dev server config. No CORS needed in dev.

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
- Node.js, Express 5, JSON file persistence, tsx
- Tauri v2 (Rust) for desktop wrapper, tray icon, server lifecycle
- GGUF binary header parser (custom, reads metadata without loading full file)
- VRAM estimation using oobabooga's regression formula
- @huggingface/hub for HF API (model search, file listing)
- node-downloader-helper for model downloads (pause/resume/progress)
- markdown-to-jsx + DOMPurify for README rendering
- assistant-ui + Vercel AI SDK for chat UI (see Chat section)
- sql.js (WASM) for chat persistence (no native addons, bundles with pkg)

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

The chat page is a convenience feature for testing servers and evaluating models. Thread management is intentionally minimal.

### Stack

- `@assistant-ui/react` + `@assistant-ui/react-ai-sdk` for the chat UI (thread list, composer, message rendering, branching, editing, attachments, markdown, code blocks — all provided by the library, not maintained by us)
- Vercel AI SDK (`ai` + `@ai-sdk/openai`) for streaming — `createOpenAI` pointed directly at the llama-server port from the browser, using `provider.chat('model')` to force Chat Completions API (AI SDK v6 defaults to Responses API which llama-server doesn't support)
- `sql.js` (SQLite compiled to WASM) for chat persistence on the backend — no native addons, bundles cleanly with esbuild + `@yao-pkg/pkg`
- Tailwind scoped via `@layer` ordering so it doesn't clobber Chakra UI styles on other pages

### Backend

- `packages/server/src/util/chatDb.ts` — sql.js wrapper with debounced saves to `~/.config/warpcore/chat.db`
- `packages/server/src/routes/chat.ts` — REST router mounted at `/api/chat`
- SQLite schema: `threads`, `messages`, `folders`, `thread_configs` tables
- Chat presets stored via `chatPresets.ts` (JSON file service)
- In pkg builds, sql.js WASM binary is loaded from filesystem candidates next to the executable (detects `process.pkg` and searches known paths)

### Frontend

- `ChatPage.tsx` — `useLocalRuntime` + `useRemoteThreadListRuntime`, server selector dropdown, assistant-ui shadcn components
- `ChatConfigSidebar.tsx` — collapsible right panel with full inference params (temperature, top_p, top_k, min_p, repeat_penalty, frequency_penalty, presence_penalty, max_tokens, seed, mirostat, response_format, reasoning_format, enable_thinking, cache_prompt), system prompt editor, preset save/load/delete
- Config persistence per-thread via `thread_configs` table, debounced save, loaded on thread switch using `useAuiState` for reactive thread ID detection
- Per-message timing stats captured via metadata (tokens/second, prompt tokens, completion tokens)
- Empty-thread-on-launch bug fixed by deferring backend thread creation to first message append

### Shared Types

- `IChatThread`, `IChatMessage`, `IChatFolder`, `IChatInferenceParams`, `IChatPreset`, `IThreadConfig`, `IChatMessageStats`
- `EChatRole`, `EResponseFormat`, `EReasoningFormat` enums
- Chat thread/message/folder create payloads

### Chat API Routes

```
GET/POST         /api/chat/threads
GET/PUT/DELETE   /api/chat/threads/:id
GET/POST         /api/chat/threads/:id/messages
GET/PUT          /api/chat/threads/:id/config
GET/POST         /api/chat/folders
PUT/DELETE       /api/chat/folders/:id
GET/POST/DELETE  /api/chat/presets
GET/PUT/DELETE   /api/chat/presets/:id
```

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
GET    /api/proxy/routes        — List current sticky routes (alias → server mapping)
DELETE /api/proxy/routes        — Clear all sticky routes
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
GET    /api/hub/search?q=&sort=&params_min=&params_max=
GET    /api/hub/model/:author/:name
POST   /api/hub/download
GET    /api/hub/downloads
POST   /api/hub/downloads/:id/pause
POST   /api/hub/downloads/:id/resume
POST   /api/hub/downloads/:id/cancel
DELETE /api/hub/downloads/history
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

### Hub API Routes

```
GET    /api/hub/search?q=&sort=&params_min=&params_max=
GET    /api/hub/model/:author/:name
POST   /api/hub/download
GET    /api/hub/downloads
POST   /api/hub/downloads/:id/pause
POST   /api/hub/downloads/:id/resume
POST   /api/hub/downloads/:id/cancel
DELETE /api/hub/downloads/history
```

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

```
GET/PUT          /api/settings
GET/POST         /api/backends
GET/PUT/DELETE   /api/backends/:id
POST             /api/backends/:id/validate
GET              /api/models
POST             /api/models/scan
GET/POST         /api/servers
POST             /api/servers/:id/stop
POST             /api/servers/:id/restart
DELETE           /api/servers/:id
GET/DELETE       /api/servers/:id/logs
GET/POST/DELETE  /api/presets
GET              /api/update/check
GET              /api/update/version
GET              /api/health
GET              /api/proxy/status
GET/DELETE       /api/proxy/routes
GET/DELETE       /api/proxy/routes/:alias
POST             /api/proxy/start
POST             /api/proxy/stop
GET/POST         /api/chat/threads
GET/PUT/DELETE   /api/chat/threads/:id
GET/POST         /api/chat/threads/:id/messages
GET/PUT          /api/chat/threads/:id/config
GET/POST         /api/chat/folders
PUT/DELETE       /api/chat/folders/:id
GET/POST/DELETE  /api/chat/presets
GET/PUT/DELETE   /api/chat/presets/:id
```

## Data Persistence (JSON File)

Keys are namespaced in a single JSON file at `~/.config/warpcore/warpcore-data.json`:

```
settings:general    — ISettings
backends:{id}       — IBackend
servers:{id}        — IServer
presets:{id}        — IPreset
downloads:{id}      — IDownload
_schemaVersion      — number (migration tracking)
```

Chat data is stored separately in `~/.config/warpcore/chat.db` (SQLite via sql.js).
