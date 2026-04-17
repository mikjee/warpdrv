# Architecture

Monorepo structure, tech stack, and key design decisions for WarpCore.

## Workspace Structure

```
packages/
  shared/    @warpcore/shared   — Types, enums, VRAM calculator. No runtime deps.
  app/       @warpcore/app      — React 19 + Chakra UI v3 + Vite. Frontend.
  server/    @warpcore/server   — Express 5, REST endpoints, SSE broadcaster.
  bridge/    @warpcore/bridge   — Inference orchestration, MCP tools, SQLite.
  desktop/   @warpcore/desktop  — Tauri v2 shell. Tray icon, server sidecar.
```

Frontend proxies `/api` to backend via Vite dev server config. No CORS needed in dev.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Chakra UI v3, Vite, React Router, Lucide icons |
| State | Zustand (mirrors Bridge events), @assistant-ui/react with useExternalStoreRuntime |
| Backend | Node.js, Express 5, better-sqlite3, tsx |
| Real-time | better-sse for SSE broadcasting |
| Desktop | Tauri v2 (Rust) |
| Chat | GGUF binary header parser, @huggingface/hub for HF API, node-downloader-helper |
| Rendering | markdown-to-jsx + DOMPurify for README rendering |
| MCP | @modelcontextprotocol/sdk |

## TypeScript Conventions

- Tab width 4 (hard tabs, not spaces)
- Type prefixes: `I` for interfaces, `T` for types, `E` for enums
- `Record<>` instead of `Map`
- Named types for IDs: `TBackendId`, `TServerId`, etc.
- Enum values in UPPER_SNAKE_CASE
- `//` style comments only, no JSDoc
- Single-line sub blocks on same line as if/for
- No explicit type-casting, no `any`

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Shared types as contract | App and server both import from @warpcore/shared |
| Detached server processes | Survive if the UI restarts |
| PID tracking | PIDs stored in JSON store, reconciled on startup |
| Model scanning | Scanned from configurable root dirs, HuggingFace folder layout |
| Multi-shard GGUFs | Auto-detected by `-NNNNN-of-NNNNN.gguf` pattern |
| mmproj auto-detect | By `mmproj` in filename |
| Client-side VRAM | VRAM calculator runs client-side for instant feedback |
| Config dir | Platform-appropriate: `~/.config/warpcore/` on Linux |
| Schema migrations | Numbered functions on startup, never delete user data |

## Running

```bash
npm install          # install all workspaces
npm run dev          # app (port 3000) + server (port 4400) via concurrently
npm run dev:server   # backend only
npm run dev:app      # frontend only
```

### Desktop (Tauri)

Requires Rust toolchain and system deps:

```bash
npm run dev           # start server + app first
cd packages/desktop && npx tauri dev   # then start Tauri
```

For release builds:

```bash
./release.sh          # builds deb only (default)
./release.sh deb appimage   # both formats
```

Artifacts land in `packages/desktop/target/release/bundle/`.

## VSCode Debugging

Use "warpcore-all (single terminal)" launch config to debug both server and app together.
