# Models

Browse, scan, and manage locally available GGUF model files.

## Overview

The Models page shows all GGUF models found in your configured model directories. Models are scanned automatically and display metadata extracted from the GGUF file headers — quant type, parameter count, context length, and file size.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Model list | Table view of all scanned models with name, user, quant type, param count, size, context length, and file count |
| Search bar | Filter models by name or user |
| Sort controls | Clickable column headers to sort by name, user, quant, params, size, context, or file count (ascending/descending) |
| Scan button | Rescan configured model directories for new or changed files |
| Model row menu | Three-dot menu with "Open on HuggingFace" and "Copy folder path" options |
| Quant badges | Color-coded badges for quant types: green (Q5+), yellow (Q3-Q4), blue (Q8), grey (F32/BF16/F16) |

## Model Scan

### Configured Directories

Models are scanned from directories configured in Settings. These are the root directories where your GGUF files are stored.

### Scan Process

1. The scanner walks each configured directory recursively
2. Files matching GGUF patterns are parsed for metadata (no full file loading required)
3. Multi-shard GGUFs (files ending in `-NNNNN-of-NNNNN.gguf`) are detected and grouped as a single model
4. mmproj files (multi-modal project files) are auto-detected by filename pattern
5. Metadata is extracted from the GGUF binary header — no full file parsing needed

### What Gets Detected

| Item | Detection Method |
|------|-----------------|
| GGUF files | `.gguf` extension in model directories |
| Multi-shard GGUFs | `-NNNNN-of-NNNNN.gguf` filename pattern |
| mmproj files | `mmproj` in filename (auto-linked to parent model) |
| Model metadata | GGUF binary header parser (metadata-only, no full file loading) |

### Model Metadata

| Field | Source |
|-------|--------|
| Name | Extracted from GGUF header (`tokenizer.ggml.name`) |
| User | Repository author (e.g., `bartowski`, `Qwen`) |
| Quant type | Quantization type from header (Q4_K_M, Q8_0, etc.) |
| Parameter count | From header (`tokenizer.ggml.parameters` or model metadata) |
| Context length | From header (`tokenizer.ggml.context_length`) |
| File size | File size in MB/GB |
| File count | Number of files for the model (1 for single-shard, 4+ for multi-shard) |

## Model Details

### Per-Model Information

- **Name**: Model identifier (e.g., "Qwen2.5-7B-Instruct")
- **User**: HuggingFace repository author
- **Quant type**: Quantization variant (Q4_K_M, Q5_K_M, Q8_0, etc.)
- **Size**: Total file size across all shards
- **Context**: Maximum context length in tokens
- **Files**: Number of files (multi-shard models have multiple files)

### Model Actions

- **Open on HuggingFace**: Opens the model's HuggingFace page in the browser
- **Copy folder path**: Copies the local folder path to clipboard
- **Launch server**: Select the model from the launch dialog on the Servers page
- **Download from Hub**: Download new versions or variants from the Hub page

### VRAM Estimation

VRAM estimation is used in the launch dialog when selecting a model for a server — NOT in the Models listing page. The VRAM calculator estimates required VRAM based on model size, quant type, and context length.

## Key Settings

| Setting | Description |
|---------|-------------|
| Model directories | List of root directories to scan for GGUF files (configured in Settings) |
| Auto-scan | Models are scanned automatically when directories change |

## Key Behaviors

- **Multi-shard support**: Files like `model-Q4_K_M-00001-of-00004.gguf` through `00004` are grouped as one model
- **mmproj auto-detect**: mmproj files (multi-modal) are automatically associated with their parent model
- **Metadata-only parsing**: GGUF metadata is read from the binary header without loading the full file
- **No VRAM estimation on listing page**: VRAM estimation is only used in the server launch dialog, not on the Models page
- **HuggingFace links**: Each model links to its HuggingFace repository for browsing variants
- **Folder paths**: Local folder paths can be copied for use with external tools
