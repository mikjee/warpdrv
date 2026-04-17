# Release Process

Update system, version management, and build/release workflow.

## Update System

WarpCore uses a simple manual update system — no auto-updater or signing keys.

### Version Check

- `release.json` at repo root defines current version, update check URL, and download page URL
- Server exposes `GET /api/update/check` which fetches remote `release.json` and compares semver
- Frontend shows a dismissable blue banner when a newer version is available
- User clicks "Download" which opens the GitHub Releases page in the system browser
- Update is manual: download new AppImage/deb, replace old one. Config data in `~/.config/warpcore/` is preserved
- Migration runner handles any schema changes on next startup

### Release Workflow

1. Run `./release.sh` (or `./release.sh deb appimage` for both formats)
   - Bumps version in `release.json`, `tauri.conf.json`, `package.json`
   - Builds everything
2. Test the build locally
3. Create GitHub release tagged with the version
4. Upload artifacts to the release
5. Push `release.json` to main branch (triggers update check for running instances)

## Building

### Deb Package (Default)

```bash
./release.sh              # builds deb only
./release.sh deb          # explicit deb
```

### AppImage

```bash
./release.sh appimage     # AppImage only
```

### Both Formats

```bash
./release.sh deb appimage # both deb and AppImage
```

The script accepts bundle format names as positional arguments passed to `npx tauri build --bundles`. With no arguments it defaults to `deb` only because AppImage takes a long time to build. To add more formats, pass any format that Tauri's `--bundles` flag supports (e.g., `deb`, `appimage`, `rpm`, `dmg`, `msi`, `nsis`, `updater`).

Artifacts land in `packages/desktop/target/release/bundle/`. Upload to GitHub Releases manually.

## Artifacts

| Format | Output Path |
|--------|-------------|
| deb | `packages/desktop/target/release/bundle/deb/WarpCore_<version>_amd64.deb` |
| AppImage | `packages/desktop/target/release/bundle/appimage/WarpCore_<version>_amd64.AppImage` |

## Version Files

Version is defined in multiple files and bumped together by `release.sh`:

| File | What it controls |
|------|-----------------|
| `release.json` | Update check version, download page URL |
| `packages/desktop/src-tauri/tauri.conf.json` | Tauri app version |
| `packages/desktop/package.json` | Desktop package version |
| `packages/app/package.json` | App package version |

## Configuration Preservation

Config data in `~/.config/warpcore/` is preserved across updates:

| File | Preserved |
|------|-----------|
| `warpcore-data.json` | All settings, backends, servers, presets, recipes |
| `chat.db` | All chat data, threads, messages |
| `mcp.json` | MCP server configs |
| `chat-presets.json` | Inference presets |
| `checkpoints/` | Saved checkpoints |

## Migration Runner

Schema migrations run on startup:

- Numbered migration functions in `packages/server/src/util/store.ts`
- Migrations transform existing data, never delete
- `_schemaVersion` in `warpcore-data.json` tracks current version
- All pending migrations run in order on startup
