# Servers

Manage llama-server instances — launch, stop, monitor, and configure local LLM servers.

## Overview

The Servers page is the central hub for running and managing llama-server processes. Each server instance loads one model and provides an OpenAI-compatible API endpoint for chat inference.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Server cards | Show model name, status badge, port, VRAM bar, slot monitoring, and action buttons |
| Launch dialog | Full form to configure a new server: model selection, backend, GPU settings, context size, threads |
| Action buttons | Start (play), Stop (square), Restart (rotate icon) on each server card |
| Logs dialog | Terminal-style viewer for server logs, with live scrolling and download option |
| SlotPill | Real-time slot status indicator showing idle/processing state and token counts |
| VRAM bar | Visual bar showing VRAM usage relative to available GPU memory |

## How It Works

1. **Launch a server**: Click "Launch Server" or "Start" on a server card. Choose a model, backend, and configure parameters in the launch dialog.
2. **Monitor status**: Running servers show a green status badge. Stopped servers show grey. Errors show red.
3. **Stop a server**: Click "Stop" to gracefully shut down a server. The process survives UI restarts.
4. **Restart**: Click "Restart" to stop and immediately relaunch with the same configuration.
5. **View logs**: Click the terminal icon on any server to open the live log viewer.

## Server Aliases

Servers can be assigned aliases — custom names used by the Model Proxy for routing.

- **Set aliases**: Edit a server's aliases in the server config dialog
- **Use in proxy**: The proxy routes requests by alias. An alias maps to one running server
- **Sticky routing**: Once an alias resolves to a server, it sticks to that server until it stops
- **Multiple aliases**: A single server can have multiple aliases, each independently routable

## Checkpointing & Slot Selection

Save and restore KV cache states for conversation resumption.

### Save Checkpoints

- **Save on stop**: Toggle "Auto-save checkpoint on stop" in the launch dialog. A checkpoint is saved automatically when you stop the server.
- **Save manually**: Open the checkpoint save dialog from the server card. Choose which slots to save:
  - **All slots** — save all slots as a bundle
  - **Latest** — save the most recently active slot
  - **Largest** — save the slot with the most cached tokens
  - **Specific slot** — manually select a slot by index
- **Name checkpoints**: Give each checkpoint a custom name for easy identification

### Restore Checkpoints

- **Auto-load on start**: Toggle "Auto-load checkpoint on start" in the launch dialog. The latest compatible checkpoint is loaded automatically when the server starts.
- **Restore manually**: Open the checkpoint load dialog from the server card. Filter by compatible checkpoints and restore.

### Fingerprint Validation

Checkpoints are validated against the running server's model. A mismatch prevents restoration and shows the expected vs actual model details.

## Speculative Decoding

Use a smaller "draft" model to generate speculative tokens, speeding up inference.

### Configure Speculative Decoding

In the launch dialog, enable speculative decoding and configure:

| Parameter | Default | Description |
|-----------|---------|-------------|
| Draft model | — | Path to a smaller GGUF file used as the draft model |
| Draft device | (same as target) | Which GPU to run the draft model on |
| Draft GPU layers | 999 | How many layers of the draft model to offload to GPU |
| Draft context size | 0 (auto) | Context size for the draft model |
| Draft max | 16 | Max tokens to draft per step |
| Draft min | 0 | Min tokens to draft per step |
| Draft p-min | 0.75 | Acceptance probability threshold |

### How It Works

1. The draft model generates multiple speculative tokens
2. The target model verifies these tokens in parallel
3. Accepted tokens are kept; rejected tokens cause a fallback to normal generation
4. Result is faster inference when the draft model's predictions are accurate

## Backend Selection

Choose which llama.cpp binary (backend) to use for launching a server.

### Direct Backend Selection

Select a specific backend directly. The server uses that exact binary and its configuration.

### Backend Group Selection

Select a backend group instead of a specific backend. The group's active backend is used. If the active backend is unavailable, you can switch to another backend in the group.

### GPU Device Selection

After selecting a backend, choose the target GPU device (CUDA0, Vulkan1, etc.). The device list is auto-populated from the backend's device discovery.

### Auto-Load on Startup

Servers can be configured to auto-launch on WarpCore startup. Enable "Auto-launch" in the server configuration. The server will start automatically when WarpCore launches.

## Key Settings

| Setting | Description |
|---------|-------------|
| Model | GGUF file to load. Selected from scanned local models or Hub downloads |
| Backend | llama.cpp binary (CUDA, ROCm, Vulkan, etc.). Determines GPU backend |
| GPU Device | Target GPU device for loading the model |
| GPU Layers | Number of model layers to offload to GPU (0 = auto, 999 = all) |
| Context Size | Maximum context window size in tokens (0 = model default) |
| Batch Size | Processing batch size |
| Threads | CPU threads for inference (0 = auto) |
| Port | API port (0 = auto-assign) |
| Device | Target device string (e.g., "CUDA0", "Vulkan1") |
| Extra Args | Free-form additional llama-server command-line flags |
| Parallel Slots | Number of concurrent conversation slots (0 = server default) |
| Auto-launch | Start server automatically on WarpCore startup |
| Auto-save on stop | Save checkpoint when server is stopped |
| Auto-load on start | Restore latest checkpoint when server starts |

## Key Behaviors

- **Detached processes**: Server processes are spawned detached — they survive if the UI restarts or crashes
- **PID tracking**: Process IDs are stored in the config and reconciled on startup
- **Multi-GPU**: Each server uses one GPU device. Multiple servers can run on different GPUs simultaneously
- **Slot monitoring**: Real-time slot state (processing, tokens generated) is tracked via llama-server log parsing
- **Health monitoring**: The server health monitor polls the API every 3 seconds. Auto-respawns if the process dies
- **Sticky routing**: Server aliases are used by the Model Proxy to route requests consistently to the same instance
