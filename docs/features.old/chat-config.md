# Chat — Config

Chat configuration panel: system prompt, inference presets, and reasoning settings.

## Overview

The config panel sits in the chat sidebar and provides per-thread settings for the AI assistant's behavior: system prompt, inference parameters, and reasoning mode.

## Key UI Elements

| Element | Description |
|---------|-------------|
| System prompt editor | Text area for the thread's system prompt — defines the assistant's role and behavior |
| Preset selector | Dropdown to select from saved inference parameter presets |
| Preset management | Create, edit, and delete presets via the presets dialog |
| Inference params | Temperature, top_p, samplers, and other inference parameters shown and adjustable per-thread |
| Reasoning toggle | Switch between standard and extended reasoning modes |
| Token counter | Shows current token usage for the thread context |

## How It Works

1. **System prompt**: Edit the system prompt directly in the config panel. Changes apply immediately to new messages.
2. **Select a preset**: Choose from saved presets to apply a full set of inference parameters at once.
3. **Fine-tune params**: Override individual parameters (temperature, top_p, etc.) from the selected preset.
4. **Reasoning mode**: Toggle between standard and extended reasoning for complex tasks.

## Settings

| Setting | Description |
|---------|-------------|
| System prompt | Per-thread. Defines assistant behavior, role, instructions. Empty = no system prompt. |
| Preset | Per-thread. Saved inference parameter sets. Select from existing or create new ones. |
| Temperature | Per-thread. Controls randomness (lower = more deterministic). |
| Top_p | Per-thread. Nucleus sampling parameter. |
| Samplers | Per-thread. Additional sampling settings (frequency penalty, presence penalty, etc.). |
| Reasoning effort | Per-thread. Controls how much the model reasons before answering. |
| Context size | Per-server (set in launch dialog). Maximum number of tokens in context window. |

## Key Behaviors

- **Per-thread config**: Each thread can have its own system prompt and inference parameters
- **Inference params passed through**: WarpCore does NOT handle inference-time params internally — they are passed directly to the llama-server from the chat config
- **Preset inheritance**: When you create a preset, it becomes available across all threads
- **Real-time updates**: Changing the system prompt or inference params applies to the next message — no restart required
- **Token tracking**: WarpCore tracks prompt tokens, completion tokens, and total tokens per thread — displayed in the thread header
