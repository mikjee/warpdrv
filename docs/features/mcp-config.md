# MCP Server Config

Manage Model Context Protocol servers — configure stdio and HTTP servers, monitor connection status, and control permissions.

## Overview

WarpCore manages MCP server configuration through a file-based `mcp.json` config (Cursor-compatible format) exposed via the MCP page. This lets you add external tool servers, manage their lifecycle, and control which tools are available.

## Configuration File

**Location:** `~/.config/warpcore/mcp.json` (platform-specific, accessible via the Settings page)

### Format

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

### Transport Types

| Type | Config | Description |
|------|--------|-------------|
| stdio | `command` + `args` | Server runs as a subprocess |
| HTTP | `url` | Server runs externally, optional `headers` for auth |

### Server Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `command` | string | stdio | Executable path |
| `args` | string[] | stdio | Arguments array |
| `env` | Record<string, string> | Optional | Environment variables |
| `url` | string | HTTP | Server URL |
| `headers` | Record<string, string> | HTTP | Custom headers |
| `timeout` | number | Optional | Connection timeout in seconds |

## Key UI Elements

| Element | Description |
|---------|-------------|
| MCP Page | Split view: server list on the left, config editor and tool permissions on the right |
| Add Server button | Opens a dialog to add a new MCP server with name, transport type, and configuration |
| Server cards | Show connection status (green/red dot), tool count, last refresh time |
| Config editor | JSON editor for the mcp.json file with real-time validation |
| Permission controls | Per-server enable/disable toggle and per-tool approval mode selector |
| Tool call status | Visual indicators in chat: PENDING (amber), EXECUTING (spinner), COMPLETED (checkmark), DENIED (ban), ERROR (alert) |

## How It Works

1. **Add a server**: Click "Add Server" on the MCP page. Enter a name, choose transport type (stdio or HTTP), and fill in the configuration fields.
2. **Connect**: The server connects automatically after saving. A green dot indicates a successful connection. Red dot indicates an error.
3. **Refresh tools**: Click the refresh button on any server to re-discover its available tools.
4. **Manage permissions**: Toggle servers on/off globally. For individual tools, set the approval mode:
   - **Allow**: Tool executes automatically
   - **Ask**: User must approve each use before execution
   - **Deny**: Tool is never available
5. **Reload**: Click "Reload All" to disconnect and reconnect every server from the current config.

## Settings

| Setting | Description |
|---------|-------------|
| Config file path | Platform-specific location: `~/.config/warpcore/mcp.json` (Linux), `~/Library/Application Support/warpcore/mcp.json` (macOS), `%APPDATA%\warpcore\mcp.json` (Windows) |

## Key Behaviors

- **Cursor-compatible format**: Uses the same `mcp.json` schema as Cursor editor for cross-editor compatibility
- **File-based config**: Changes are written to disk immediately. Config is not stored in WarpCore's internal data store
- **Config path endpoint**: The UI can display the config file location to the user
- **Separation of concerns**: Config management (MCP page) is separate from execution (Bridge package). The Bridge owns server connections and tool calls
- **Permissions in SQLite**: Unlike config (file-based), permissions use Bridge's SQLite persistence for consistency with chat tool approval flow
- **Restart = Refresh**: Both the restart and refresh actions trigger a full reconnect and tool list refresh
- **Cross-editor compatibility**: The mcp.json format is compatible with Cursor, VS Code MCP extensions, and other MCP-compatible tools
