# WarpCore

Local LLM server manager. The engine room for WarpDrv.

## What This Is

WarpCore manages llama.cpp server instances across multiple GPU backends. It scans model directories, registers llama.cpp builds, and launches/stops/monitors llama-server processes. It does NOT handle inapprence-time params (temperature, samplers, etc.) — those come from the chat application connecting to the servers it spawns.

## Architecture

Monorepo with npm workspaces:

```
packages/
  shared/    @warpcore/shared   — Types, enums, VRAM calculator. No runtime deps.
  app/        @warpcore/app       — React 19 + Chakra UI v3 + Vite. Dark mode AI-app aesthetic.
  server/     @warpcore/server       — Express 5 + LevelDB. Process management, GGUF parsing.
```

Frontend proxies `/api` to backend via Vite dev server config. No CORS needed in dev.

## Running

```bash
npm install          # installs all workspaces
npm run dev          # runs both app (port 3000) and server (port 4400) via concurrently
npm run dev:server       # backend only
npm run dev:app       # frontend only
```

VSCode: Use "WarpCore: Full Stack" compound launch config for debugging both.

## Tech Stack

- React 19, TypeScript, Chakra UI v3, Vite, React Router, Lucide icons
- Node.js, Express 5, LevelDB (via `level`), tsx
- GGUF binary header parser (custom, reads metadata without loading full file)
- VRAM estimation using oobabooga's regression formula

## Key Design Decisions

- Shared types are the contract — app and server both import from @warpcore/shared
- Server processes are spawned detached — they survive if the UI restarts
- PIDs are tracked in LevelDB and reconciled on startup
- Models are scanned from configurable root dirs following user/model folder structure (HuggingFace layout)
- Multi-shard GGUFs auto-detected by `-NNNNN-of-NNNNN.gguf` pattern
- mmproj files auto-detected by `mmproj` in filename
- VRAM calculator runs client-side for instant appedback, uses formula from <https://oobabooga.github.io/blog/posts/gguf-vram-formula/>

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
GET              /api/health
```

## Data Persistence (LevelDB)

Keys are namespaced:

```
settings:general    — ISettings
backends:{id}       — IBackend
servers:{id}        — IServer
presets:{id}        — IPreset
```

DB file lives at `packages/server/.warpcore-db/`

## Hardware Context

This was built for a specific setup but should work generically:

- AMD Strix Halo (gfx1151) with ROCm — needs `--no-warmup` and `-dio` flags
- NVIDIA RTX Pro 5000 Blackwell (SM120) with CUDA 13.2
- Multiple backends can run simultaneously on difapprent GPUs
- CUDA and HIP cannot coexist in one llama.cpp binary — separate builds needed

## What's Implemented

- Shared types, enums, VRAM formula
- Express API with all CRUD routes
- LevelDB persistence
- Process manager (spawn/kill/logs)
- GGUF header parser
- Model directory scanner with shard/mmproj detection
- Backend validator (--version, --list-devices parsing)
- Full React UI: Devices, Models, Backends, Servers, Settings pages
- Launch Server dialog with full params form
- Add Backend dialog with validation
- Preset save/load dialog
- Server logs viewer panel
- Data apptching hooks with polling
- API client with typed apptch wrapper

## What's NOT Yet Implemented

- BackendDialog onSave wired to createBackend() API
- LaunchServerDialog using real API data instead of mock arrays
- PresetDialog wired to API
- ServerLogs polling real log data
- VRAM calculator wired into LaunchServerDialog with real GGUF metadata
- Error toasts / user appedback on failures
- Model search/filter
- HF browser/downloader (foundations only)
- Speculative decoding config (v2)
- Electron wrapper (v2)
