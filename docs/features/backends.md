# Backends

Manage llama.cpp builds and GPU backends — the engines that run your models.

## Overview

Backends are llama.cpp server binaries (like `llama-server`) compiled with different GPU backends (CUDA, ROCm, Vulkan). Each backend can detect available GPUs on your system. Servers are launched using a backend binary.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Backends list | Shows all registered backends with name, validation status, version, and device count |
| GPU devices | Expandable list of detected GPUs per backend, showing device name, VRAM, and connection type |
| Backend groups | List of backend groups with active backend highlighted |
| Add/Validate/Edit/Delete buttons | Full CRUD operations for backends and groups |
| Validation status | Color-coded status: green (valid), red (invalid), yellow (checking), grey (idle) |
| Device cards | Per-GPU cards showing name, VRAM total/free, backend type (CUDA/ROCm/Vulkan), compute capability |

## Backend Builds

A backend is a specific llama.cpp build with a binary path and detected GPUs.

### Adding a Backend

1. Click "Add Backend"
2. Enter a name (e.g., "CUDA 12.1", "Vulkan RTX 4090")
3. Browse to the `llama-server` binary file
4. Set default arguments (command-line flags used for every server launched with this backend)
5. Provide a description
6. Click "Validate" to check the binary and discover GPUs
7. Validation runs `llama-cli --list-devices` to detect compiled backends and available GPUs

### Validating a Backend

Validation performs three checks:
1. **Binary exists**: Checks the file exists and is executable
2. **Version detection**: Runs the binary with `--list-devices` to extract the build type (CUDA, ROCm, Vulkan)
3. **Device discovery**: Parses the output to list available GPUs with VRAM, compute capability, and connection type

Validation can be re-run at any time by clicking "Validate" on an existing backend.

### Default Arguments

Each backend has default command-line arguments applied when launching servers. Common examples:
- `--flash-attn` — enable flash attention
- `--mlock` — lock model in memory
- `--mmap` — memory-map the model file
- GPU-specific flags for CUDA/ROCm/Vulkan

## Backend Groups vs Direct Selection

When launching a server, you can choose between a specific backend or a backend group.

### Direct Backend Selection

Select a specific backend. The server uses that exact binary. If the backend is unavailable, the server cannot launch.

### Backend Group Selection

Create a group of backends and select one as active. The group provides flexibility:
- **Switch active backend**: If the active backend fails, switch to another backend in the group
- **Multi-GPU support**: Each backend in a group can target a different GPU
- **Failover**: Groups let you rotate between GPUs or backends without creating separate server configs

### Group Management

- **Create group**: Enter a name, select backends to include, choose the active backend
- **Edit group**: Change name, description, or add/remove backends
- **Switch active**: Click on a different backend in the group to make it the active one
- **Delete group**: Removes the group but does not affect the backends inside it

## GPU Devices

GPUs are auto-detected from each backend via `llama-cli --list-devices`.

### Detected Information

| Field | Description |
|-------|-------------|
| Device ID | Format: `CUDA0`, `Vulkan1`, `ROCm2` — matches what llama-server expects |
| Name | GPU model name (e.g., "NVIDIA GeForce RTX 4090") |
| Backend Type | CUDA, ROCm, or Vulkan |
| VRAM Total | Total GPU memory in MiB |
| VRAM Free | Free GPU memory in MiB |
| Compute Capability | GPU compute capability (e.g., "8.9" for Ada Lovelace) |
| Connection | "Integrated", "PCIe", "USB4 eGPU", etc. |

### Device Discovery Process

1. Backend runs `llama-cli --list-devices`
2. Output is parsed for the "Available devices:" section (primary format)
3. If not found, falls back to parsing verbose init output (older llama.cpp builds)
4. GPUs are categorized by backend type (CUDA/ROCm/Vulkan) and indexed

### VRAM Display

GPU VRAM is shown in the device cards and used by the VRAM estimator when launching servers. The VRAM bar on server cards shows current VRAM usage against available memory.

## Using Recipes to Create Backends

Recipes can automate the creation of new llama.cpp backends — downloading, building, or validating binaries.

### Recipe Workflow for Backend Creation

1. **Clone the llama.cpp repository** using a `#!step`
2. **Build the binary** with the desired GPU backend flags (CUDA, ROCm, Vulkan)
3. **Validate the binary** by running `llama-cli --list-devices`
4. **Copy to desired location** (e.g., `/usr/local/bin/llama-server-cuda`)
5. **Register the backend** via the WarpCore API (`POST /api/backends`)

### Example Recipe Steps

```bash
#!step Clone llama.cpp
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp

#!step Build CUDA
make -j$(nproc) GGML_CUDA=1

#!step Validate
./bin/llama-cli --list-devices

#!step Copy binary
cp ./bin/llama-server /usr/local/bin/llama-server-cuda
chmod +x /usr/local/bin/llama-server-cuda
```

### Benefits of Using Recipes

- **Reproducible builds**: Same build steps every time, with pinned commit hashes
- **Custom flags**: Full control over compile flags (e.g., `GGML_CUDA_FORCE_MMQ`)
- **Multi-backend builds**: Build CUDA, ROCm, and Vulkan versions in one recipe run
- **Automated validation**: Recipes can include validation steps to verify the build before registering

## Key Settings

| Setting | Description |
|---------|-------------|
| Binary path | Absolute path to the `llama-server` binary |
| Default arguments | Array of command-line flags applied to every server launched with this backend |
| Description | Human-readable description of the backend's purpose |
| GPU device selection | Chosen from detected devices when launching a server |

## Key Behaviors

- **Auto-detection**: GPU devices are discovered automatically when a backend is validated
- **Version detection**: Build type (CUDA/ROCm/Vulkan) is detected from the `--list-devices` output
- **Backward compatible**: Parses both new format ("Available devices:" section) and old format (verbose init output)
- **Validation on change**: If the binary path is changed in an existing backend, re-validation is required
- **Group flexibility**: Backend groups can contain backends of different types (CUDA + Vulkan, etc.)
- **Detached servers**: Server processes spawned from a backend survive UI restarts
