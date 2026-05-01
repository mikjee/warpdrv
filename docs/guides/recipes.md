# Recipes

Recipe is a simple feature to keep all your llama-compile or other bash scripts related to LLMs in one place. They also have a smart UI to remember and auto-fill the last used values.

Esentially, a recipe is just a bash script with a small header that turns it into a UI form. You define what inputs the user picks, what steps to run, and warpdrv renders a form, runs each step in sequence, and streams output live. The recipe's name and description are set in the UI when you create or edit it.

warpdrv uses a comment parser to parse comments in a recipe and render a UI form for the inputs. The recipe can also be used to run as a standalone bash script.

## What recipes are for

- Building llama.cpp from source against a specific backend (CUDA, Vulkan, ROCm, etc.)
- Cloning, updating, or pulling repos into a chosen directory
- Installing dependencies on a fresh machine
- Downloading models from a URL into a target folder
- Running a one-shot benchmark and dumping results
- Any repeatable system task you'd otherwise paste into a terminal and tweak each time

## What recipes are NOT for

- Running long-lived servers like `llama-server` (use the warpdrv backend launcher instead)
- Anything that prompts the user mid-run (recipes collect all inputs upfront)
- Anything where step B's available choices depend on step A's output (no dynamic forms)
- Tasks that need an interactive `sudo` password (run those manually first, then trigger the recipe)

---

## Getting started

The fastest way to try recipes is to copy a working one. warpdrv ships with a set in `docs/recipes/`. Open one, look at the structure, and use it as a template.

1. Open warpdrv, go to the Recipes page
2. Click **New Recipe**, give it a name and description
3. Paste the contents of `docs/recipes/llama-cuda-vulkan.recipe` (or any other) into the editor
4. Save, then click **Run**
5. The form on the left is auto-generated from the `#!input` lines. Fill it in, hit Run, watch each step stream its output

Once that works, duplicate the recipe and start tweaking — change the `BUILD_DIR` default, add an input, add a step. The included recipes are listed at the bottom of this doc.

---

## Writing your own recipes

Two directives. Everything else is bash.

### Anatomy

```bash
#!input NAME type [modifiers]
#!input ANOTHER_NAME type [modifiers]
#!step Step name [cwd=path]
<bash commands here>
#!step Next step name
<more bash>
```

`#!input` lines come first and define the form. `#!step` lines split the script into stages. Each stage runs in its own fresh `bash -c` process — so `cd`, shell variables, and `set` flags do not carry over between steps. Only the input env vars persist.

### Inputs

Each `#!input` becomes both a form field and an environment variable inside every step.

```bash
#!input REPO_URL string default=https://github.com/ggml-org/llama.cpp
#!input BRANCH string default=master description="Branch or tag to check out"
#!input JOBS number default=8 description="Parallel build jobs"
#!input ENABLE_VULKAN bool default=true
#!input CUDA_ARCH choice options=86,89,120 default=120 description="GPU compute capability"
```

**Types:**

| Type | Form control | Env var value |
|---|---|---|
| `string` | Text input | The string |
| `number` | Number input | Numeric string |
| `bool` | Checkbox | `true` or `false` |
| `choice` | Dropdown | The selected option string |

**Modifiers:**

- `default=...` — pre-filled value
- `description="..."` — helper text shown under the field
- `options=a,b,c` — required for `choice`, ignored for others

Inside a step, reference an input by its name as a shell variable. Always quote it:

```bash
git clone -b "$BRANCH" "$REPO_URL" "$BUILD_DIR"
```

### Steps

Each `#!step` runs as `bash -c '<commands>'` from the recipe's working directory. Add `cwd=` to override the directory for that one step:

```bash
#!step Clone repository cwd=~
git clone "$REPO_URL" "$BUILD_DIR"

#!step Configure cmake
cd "$BUILD_DIR"
cmake -B build -DGGML_CUDA=ON
```

Path expansion works for `cwd=`: `~`, `~/something`, and `$HOME` all resolve correctly.

Because each step is fresh, anything you need from a previous step's filesystem changes is fine (files persist on disk), but anything you stored in a shell variable is gone. Re-`cd` at the top of each step that needs it, or use `cwd=`.

### Built-in environment variables

warpdrv injects two extra vars into every step:

- `WARPCORE_PORT` — the port warpdrv's API is on
- `WARPCORE_TOKEN` — the access token for the API

You only need these if your recipe is talking back to warpdrv (rare). For normal build/install recipes, ignore them.

### Patterns worth knowing

**Conditional cmake flags via env var construction:**

```bash
VULKAN_FLAG=""
if [ "$ENABLE_VULKAN" = "true" ]; then VULKAN_FLAG="-DGGML_VULKAN=ON"; fi
cmake -B build -DGGML_CUDA=ON $VULKAN_FLAG
```

**Idempotent clone-or-pull:**

```bash
git clone -b "$BRANCH" "$REPO_URL" "$BUILD_DIR" 2>/dev/null \
    || (cd "$BUILD_DIR" && git fetch && git checkout "$BRANCH" && git pull)
```

**Fail fast with a pre-flight step:**

```bash
#!step Pre-flight checks
if [ ! -e /usr/lib/x86_64-linux-gnu/libxml2.so.2 ]; then
    echo "ERROR: libxml2.so.2 missing"
    exit 1
fi
```

A non-zero exit code stops the recipe immediately. The step is marked failed in the UI.

**Verify step at the end:**

End build recipes with a quick `--version` or smoke test so the user gets confirmation it actually works:

```bash
#!step Verify
"$BUILD_DIR/build/bin/llama-server" --version
```

### Common gotchas

- Forgetting to `cd` at the top of a step that needs to be in the build dir — each step starts fresh
- Unquoted variables breaking on paths with spaces — always `"$VAR"`
- Assuming `set -e` from one step carries over — it doesn't, set it again if you want it
- Trying to read a step's stdout in a later step — capture to a file in the earlier step instead
- Putting `sudo` in a recipe and expecting a password prompt — won't work, configure passwordless sudo for that command first

---

## Included recipes

| Recipe | Purpose |
|---|---|
| `llama-cuda-vulkan.recipe` | Builds llama.cpp with CUDA + optional Vulkan backend. Pick CUDA arch (Turing through Blackwell). Good for any NVIDIA GPU. |
| `llama-rocm.recipe` | Builds llama.cpp with ROCm/HIP backend. Includes the `libxml2.so.2` symlink check and the AMDGPU unroll-threshold tuning needed for Strix Halo (gfx1151). Works for other AMD targets too. |
