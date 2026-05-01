# KV Cache Checkpoints

## What is a KV cache checkpoint

A KV cache checkpoint is a snapshot of a llama-server slot's KV cache plus the token sequence behind it, written to disk as a `.bin` file. When you restore a checkpoint into a slot, llama-server skips prompt prefill entirely for that prefix — your next request starts generating immediately instead of re-processing the whole prompt from scratch.

This matters when you have a long system prompt, a large pre-loaded document, or a deep conversation that would otherwise take seconds (or minutes) to prefill on every fresh request.

warpdrv passes `--slot-save-path` to every server it launches, pointing at the directory configured in settings. That directory has to be set before any checkpoint operation works — without it, llama-server has no place to write the files and the save endpoint returns an error.

## Why use checkpoints

- **Long system prompts.** Save once after first prefill, restore on every subsequent run. No more waiting on prefill.
- **Branching exploration.** Save at a decision point in a thread, try one continuation, restore, try a different continuation.
- **Resume after restart.** Save before stopping a server, restore after starting it back up. Skip the prefill warm-up.
- **Iterating on an expensive context.** Loading a long document or codebase into context once and re-using it across many small queries.

## Compatibility

A checkpoint is bound to the exact server config that produced it. Restoring under different settings either fails or produces garbage. The relevant settings:

- Model file (different file = different checkpoint)
- Context size (`-c`)
- Flash attention (`-fa`)
- KV cache quantisation (`-ctk`, `-ctv`)
- Parallel slot count (`-np`)
- Backend build (a ROCm checkpoint won't load on a CUDA server, even with the same model)

If the running server's config doesn't match the checkpoint's, restore will not work. Stick to restoring on the same server (or a server launched with identical params on the same backend).

**Hybrid recurrent models won't work.** Qwen3-Next, Mamba2, and other models that use recurrent memory layers can't have their state partially restored — llama.cpp wipes the cache and re-prefills anyway. This is an upstream limitation in llama.cpp, not a warpdrv bug. Checkpoints will appear to save and load successfully but you'll see a full prefill on the next request. Use checkpoints with standard transformer models only.

## Setting up

In settings, set the **KV cache save path** — a directory where warpdrv will tell llama-server to write checkpoint files. Anything under your data drive is fine; just make sure there's enough space (checkpoints scale with context size and can be large for big contexts).

Per-server, you have two toggles in the launch dialog:

- **Auto-save on stop** — when the server stops, the current slot state is saved automatically before the process exits
- **Auto-load on launch** — when the server starts, the most recent compatible checkpoint is restored before the first request

## Save and load

The Servers page has save and load actions on each running server. Load shows a picker of compatible checkpoints. The Checkpoints page is for managing checkpoints (browsing, deleting, etc.).

Per-server settings in the launch dialog:

- **Auto-save** — current slot state is saved automatically
- **Auto-load on launch** — when the server starts, the most recent compatible checkpoint is restored before the first request
- **Checkpoints page** — See a list of all checkpoints and how much sace they take up on disk.
