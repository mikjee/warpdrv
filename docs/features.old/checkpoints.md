# Checkpoints

Save and restore llama-server slot KV cache states for fast conversation resumption.

## Overview

Checkpoints capture the KV cache state of running server slots and save them to disk. Restoring a checkpoint reloads the exact conversation state — including context, generated tokens, and slot positions — without re-running the full prompt through the model.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Save Checkpoint dialog | Slot selection (all/largest/latest/specific), bundle naming, replace/new mode |
| Load Checkpoint dialog | Filter by server compatibility, bundle grouping, slot mapping for restore |
| Checkpoint list page | Search, sort (newest/oldest/largest/name), inline rename, delete, bundle grouping |
| SlotPill | Real-time slot status on server cards: idle (grey), processing (blue), token count |
| Checkpoint badges | Visual indicator on server cards showing auto-save/auto-load is active |

## Slots

Server slots are the core unit of checkpointing. Each slot represents an independent conversation context within a running llama-server.

### Slot States

| State | Indicator | Description |
|-------|-----------|-------------|
| Idle | Grey | Slot is available, no active conversation |
| Processing | Blue | Slot is actively generating tokens |
| Prompting | Blue | Slot is processing the input prompt |

### Slot Selection Options

When saving a checkpoint, choose which slots to save:

| Option | Description |
|--------|-------------|
| **All** | Save all active slots as a bundle (all must share the same model fingerprint) |
| **Latest** | Save the most recently active slot |
| **Largest** | Save the slot with the most cached tokens |
| **Specific slot** | Manually select a specific slot by index |

### Bundle Model

Multiple slots can be saved together as a bundle. Bundles are identified by a shared `bundleId`. When restoring a bundle, all slots in the bundle are restored in order (slot 0 → slot N).

## Fingerprint & Loading Validation

Checkpoints include a fingerprint hash to prevent restoring a checkpoint from the wrong model.

### Fingerprint Generation

The fingerprint is computed from the model filename + file size (SHA-256, first 16 characters). This ensures checkpoints are only restored to compatible model versions.

### Validation on Restore

When you attempt to restore a checkpoint:
1. The fingerprint is compared against the target server's current model
2. If the fingerprint matches, the restore proceeds
3. If it doesn't match, an error is shown with expected vs actual model filename and size details
4. The restore is NOT attempted when fingerprints mismatch

### Cross-Server Restore

Checkpoints can be restored to a different server than the one they were saved on, as long as the fingerprints match. The Load Checkpoint dialog filters by this compatibility.

## Auto-Checkpoint

Enable automatic checkpointing at the server level.

### Auto-Save on Stop

Toggle "Save checkpoint on stop" in the Launch Server dialog. When the server is stopped, the latest active slot (or all slots as a bundle, depending on selection) is automatically saved.

### Auto-Load on Start

Toggle "Load checkpoint on start" in the Launch Server dialog. When the server starts, the latest compatible checkpoint for that server is automatically restored.

### Settings

| Setting | Description |
|---------|-------------|
| Per-server auto-save | "Save checkpoint on stop" — enabled in the Launch Server dialog |
| Per-server auto-load | "Load checkpoint on start" — enabled in the Launch Server dialog |
| Global checkpoints path | Custom checkpoint directory (default: `~/.config/warpcore/checkpoints/`) |
| Max checkpoint disk GB | Storage cap in GB (default: 50, 0 = unlimited) |

### Save Modes

| Mode | Description |
|------|-------------|
| **New** | Create a new checkpoint with a custom name |
| **Replace latest** | Delete the existing latest bundle, then save the new one |

### Disk Cap Enforcement

A configurable disk cap (default 50 GB) is enforced before saving. If at or over the cap, saving is blocked with an error message. The cap applies to all checkpoints across all servers and models.

## Key Behaviors

- **Slot state tracking**: Slot states (processing, tokens) are tracked via llama-server log parsing, not API polling. State changes are emitted via SSE events in real time
- **Snapshot on connect**: When a client connects, a full slot snapshot is emitted so the UI reflects current state immediately
- **Explicit slot mapping**: Individual checkpoints can be restored to specific slot indices, not just bundles
- **No duplicate slots**: Explicit mapping validates that no two checkpoints target the same slot
- **Cross-client sharing**: Checkpoint state is shared across all connected clients via SSE events
- **Fingerprint safety**: Checkpoints never restore to incompatible models, preventing silent corruption
