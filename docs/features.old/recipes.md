# Recipes

Automated bash script pipelines — define reusable build, deploy, and maintenance workflows with typed inputs and sequential steps.

## Overview

Recipes let you write bash scripts with structured metadata, then run them from the WarpCore UI with real-time output streaming and step-by-step monitoring.

## Recipe Syntax

Recipes are plain bash scripts with two directive types.

### Input Directives

```bash
#!input NAME type [key=value ...]
```

Must appear **before** any `#!step` directives.

**Input types:**

| Type | Form | Options |
|------|------|---------|
| `STRING` | Text input | `default=...`, `description=...` |
| `NUMBER` | Numeric input | `default=...`, `description=...` |
| `BOOL` | Toggle switch | `default=true|false`, `description=...` |
| `CHOICE` | Dropdown | `options=a,b,c`, `default=...`, `description=...` |

### Step Directives

```bash
#!step Step Name [cwd=path]
```

Followed by bash commands on subsequent lines (until the next directive or end of file).

**Options:**

| Option | Description |
|--------|-------------|
| `cwd=path` | Working directory for the step (supports `~` and `$HOME`) |

### Example Recipe

```bash
#!input MODEL_NAME string description="Model filename"
#!input THREADS number default=4
#!input QUANT bool default=true

#!step Checkout
git clone https://github.com/user/repo.git

#!step Build [cwd=./repo]
make -j$THREADS

#!step Quantize
./quantize repo.gguf repo-q4.gguf && echo "Done"
```

## Key UI Elements

| Element | Description |
|---------|-------------|
| Recipe list | Shows all recipes sorted alphabetically, built-in recipes marked with lock icon |
| Recipe editor | Source editor with syntax validation, shows errors on invalid directives |
| Input form | Auto-generated from recipe inputs — text fields, number inputs, toggles, dropdowns |
| Run dialog | Shows input form + live terminal output while step is running |
| Active run banner | Yellow banner at top of page showing currently running recipe with monitor/cancel buttons |

## How It Works

1. **Create a recipe**: Open the recipe editor, write bash commands with `#!input` and `#!step` directives. Syntax validation runs in real time.
2. **Run a recipe**: Click "Run" on any recipe. Fill in the input form, then click "Start". Only one recipe can run at a time across the entire app.
3. **Monitor progress**: Steps execute sequentially in order. Each step shows its own terminal output in real time. If a step fails, remaining steps are skipped.
4. **Cancel a run**: Use the cancel button in the active run banner. Running recipes can be interrupted at any point.

## Settings

| Setting | Description |
|---------|-------------|
| `CONTROL_API_PORT` | Environment variable automatically passed to each step, enabling recipe steps to interact with running llama-servers |

## Key Behaviors

- **Sequential execution**: Steps run in order; failure stops the pipeline (remaining steps marked SKIPPED)
- **One-at-a-time**: Only one recipe runs across the entire app (prevents resource contention)
- **Env injection**: Recipe inputs become environment variables — the primary inter-step communication mechanism
- **No sandboxing**: Recipes are raw bash, no build step or compilation
- **Built-in vs custom**: Built-in recipes (pre-bundled) are read-only. Custom recipes are fully editable and deletable
- **State persistence**: Last-used inputs and run results auto-populate on next run
- **Cross-client sharing**: Active run state is shared across all connected clients via SSE
