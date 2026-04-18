# warpdrv

Local LLM server manager using LLaMa.cpp.

## What This Is

warpdrv manages llama.cpp server instances across multiple GPU backends. It scans model directories, registers llama.cpp builds, and launches/stops/monitors llama-server processes. It does NOT handle inference-time params (temperature, samplers, etc.) — those come from the chat application connecting to the servers it spawns.

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
./release.sh    # bumps version, builds frontend, builds Tauri, outputs .AppImage + .deb
```

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

1. Run `./release.sh` — bumps version in release.json, tauri.conf.json, package.json, builds everything
2. Test the build locally
3. Create GitHub release tagged with the version
4. Upload .AppImage and .deb to the release
5. Push release.json to main branch (triggers update check for running instances)

## Hub (HuggingFace Browser)

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

- Hard tab width 4
- `I` prefix for interfaces, `T` for types, `E` for enums
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

## Hardware Context

This was built for a specific setup but should work generically:

- AMD Strix Halo (gfx1151) with ROCm — needs `--no-warmup` and `-dio` flags
- NVIDIA RTX Pro 5000 Blackwell (SM120) with CUDA 13.2
- Multiple backends can run simultaneously on different GPUs
- CUDA and HIP cannot coexist in one llama.cpp binary — separate builds needed

## What's Implemented

- Shared types, enums, VRAM formula, hub types
- Express API with all CRUD routes + hub routes + update route
- JSON file persistence with schema migrations
- Process manager (spawn/kill/logs) with health polling
- GGUF header parser
- Model directory scanner with shard/mmproj detection
- Backend validator (--version, --list-devices parsing)
- Full React UI: Devices, Models, Backends, Servers, Settings, Hub pages
- Launch Server dialog with full params, VRAM estimate, preset save/load
- Add/Edit Backend dialog with validation
- Preset save/load
- Server logs viewer panel
- Data fetching hooks with polling
- API client with typed fetch wrapper
- Toast notification system
- HuggingFace model browser with search, detail, download
- Download manager with progress, pause/resume/cancel, history
- Markdown README rendering with DOMPurify sanitization
- Tauri desktop wrapper with tray, close-to-tray, server auto-respawn
- Update check banner with version comparison
- Release script for building and versioning

## What's NOT Yet Implemented

- Model search/filter in sidebar
- Server stats polling (llama-server /health endpoint parsing for slot info)
- Loading progress bar during model load (llama-server /health reports progress 0-1)
- Speculative decoding config
- Docker build containers for cross-platform releases (Windows, macOS)
- macOS code signing and notarization
