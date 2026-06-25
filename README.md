<div align="center">

<img src="packages/app/public/logo.png" alt="warpdrv" width="180" />

# warpdrv

**Local LLM Server Manager + LlaMA.cpp + Chat + More**

😎 **Built for Local AI Master Race!** 😎

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Release](https://img.shields.io/github/v/release/mikjee/warpdrv?include_prereleases)](https://github.com/mikjee/warpdrv/releases)
[![Build](https://img.shields.io/github/actions/workflow/status/mikjee/warpdrv/ci.yml?branch=main)](https://github.com/mikjee/warpdrv/actions)
[![Stars](https://img.shields.io/github/stars/mikjee/warpdrv?style=social)](https://github.com/mikjee/warpdrv/stargazers)
[![Issues](https://img.shields.io/github/issues/mikjee/warpdrv)](https://github.com/mikjee/warpdrv/issues)
[![Platform](https://img.shields.io/badge/platform-linux-success)](#install)
[![Discord](https://img.shields.io/discord/PLACEHOLDER?label=Discord&logo=discord)](https://discord.gg/Q9kSKhY5)
[![Reddit](https://img.shields.io/badge/reddit-r%2Fwarpdrv-orange?logo=reddit)](https://www.reddit.com/r/warpdrv/)

<br />

https://github.com/user-attachments/assets/70fdddd1-3183-4793-849b-fe1cdc85bc66

<img src="docs/screenshots/themes.png" alt="warpdrv hero screenshot" width="800" />

</div>

---

> **Alpha release - expect things to be broken.** This project is in active development.

---

## What is warpdrv?

**warpdrv** is a desktop toolkit for using local LLMs.

- ⭐ **Use Local LLMs** ⭐ Chat with local models, or integrate them with your favorite AI tools.
- ⭐ **Rich Chat UI** ⭐ A polished chat interface supporting Elicitation, Graphs, Syntax Highlighting and more.
- ⭐ **Voice** ⭐ Use Kokoro Text-To-Speech, Whisper Dictation, or combine them in Voice-Chat mode.
- ⭐ **Built-in MCP** ⭐ Use tools that come with the built-in MCP server. Also supports external mcp.json.
- ⭐ **RAG** ⭐ Build projects using Workspace and Embedding using local models.
- ⭐ **Power Your Workflows** ⭐ Features such as Annotations, Guardrails, Compaction to drive your daily tasks.
- ⭐ **Multi-GPU Multi-Vendor** ⭐ Use any CUDA/ROCm/Vulkan hardware.
- ⭐ **Build your own LLAMA** ⭐ Supports custom-built LLAMA.cpp.
- ⭐ **Open Source** ⭐ No hidden code. No analytics.

---

https://github.com/user-attachments/assets/57f917a0-faf9-4a39-9a70-0fdc3f3f8658

---

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Install](#install)
- [Quick Start](#quick-start)
- [How-To Guides](#how-to-guides)
- [Hardware Compatibility](#hardware-compatibility)
- [FAQ](#faq)
- [Roadmap](#roadmap)
- [For Developers](#for-developers)
- [Contributing](#contributing)
- [Community & Support](#community--support)
- [Acknowledgements](#acknowledgements)
- [License](#license)

---

## Screenshots

<table>
<tr>
<td><img src="docs/screenshots/chat.png" alt="Chat interface" /></td>
<td><img src="docs/screenshots/hero.png" alt="Model browser" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/backends.png" alt="Llama backends" /></td>
<td><img src="docs/screenshots/hub.png" alt="Hub" /></td>
</tr>
</table>

<details>
<summary>More screenshots</summary>

<table>
<tr>
<td><img src="docs/screenshots/models.png" alt="Onboarding welcome screen" /></td>
<td><img src="docs/screenshots/launch.png" alt="Launch server dialog" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/recipe.png" alt="Llama build Recipe" /></td>
<td><img src="docs/screenshots/mcp.png" alt="MCP tool calls" /></td>
</tr>
</table>

</details>

---

## Features

**Server management.** Launch llama-server instances with full parameter control, including cache checkpointing, speculative decoding, n-gram speculation, multimodal projections, and any custom flag you need. Per-model parameter overrides let you save the right settings for each model so launch is one click.

**Proxy.** An OpenAI-compatible endpoint proxy lets any chat app talk to your running servers. Server aliases route requests to the right backend, with optional auth and a built-in web server for the UI, so you can access host and warpdrv anywhere.

**Backends.** Register one or more `llama-server` builds — stock, custom-compiled, ROCm, CUDA, whatever — and group them for quick swapping. The Recipe Engine compiles fresh builds on demand using shared bash recipes.

**Models.** Browse and download from Hugging Face Hub directly inside warpdrv, with full download management. Local models are scanned, parsed, and organised into folders.

**Chat.** A built-in chat UI with threads, folders, and full sampling configuration. MCP server integration handles tool calling with per-tool permission prompts.

**Slash Commands.** Warpdrv comes with built-in slash-commands to perform tasks such as context compaction, using to-do lists, security and compliance guardrails using parallel adversarial local models.

**Voice** You can launch Whisper servers for STT and use KokoroJS for TTS. The are combined together in a powerful voice chat mode which makes every conversation feel like a phone call. Comes with 7 different voices.

---

## Install

### Linux (recommended)

Download the latest `.deb` or `.AppImage` from the [releases page](https://github.com/mikjee/warpdrv/releases).

**.deb (Debian, Ubuntu, Mint):**

```bash
sudo dpkg -i warpdrv_*.deb
```

**.AppImage (any distro):**

```bash
chmod +x warpdrv-*.AppImage
./warpdrv-*.AppImage
```

### Windows

Download the latest `.msi` installer from the [releases page](https://github.com/mikjee/warpdrv/releases).
> **Note: Recipes feature does not work on natively Windows as it relies on Bash scripts.**

### macOS

No prebuilt build yet. Build from source — see [For Developers](#for-developers). Untested on Apple Silicon; PRs welcome.

### First Run

On first launch, warpdrv shows an **onboarding welcome screen** that walks you through:

1. Adding a folder where your GGUF models live (or where to download them)
2. Optional: registering a llama.cpp build
3. A short slideshow of next steps (launch a server, start chatting, etc.)

Config and data are stored at `~/.config/warpcore/`. Survives upgrades — config is preserved across reinstalls.

### Updating

warpdrv checks for updates on startup and shows a banner if a new version is available. Click the banner to open the releases page, download the new version, install it. Your data is preserved.

---

## Quick Start

1. **Install warpdrv** — see [Install](#install)
2. **Onboarding** — pick a models folder, optionally add a llama.cpp build
3. **Scan models** — warpdrv parses every GGUF in your folder. Alternately navigate to the Hub page to download a model.
4. **Add a backend** — point warpdrv at a `llama-server` binary; it auto-detects devices
5. **Launch a server** — pick a model, set GPU layers + context, hit Launch
6. **Open Chat** — pick the running server, start a thread, test the model

---

## How-To Guides

- [Recipes](docs/guides/recipes.md) — automating llama.cpp builds and other LLM-related bash tasks
- [Aliases](docs/guides/aliases.md) — routing addresses for servers behind the OpenAI-compatible proxy
- [Backend Groups](docs/guides/backend-groups.md) — swapping llama.cpp builds without re-configuring servers
- [Proxy, Remote Access, and Authentication](docs/guides/proxy-auth.md) — direct vs proxied access, bearer tokens, accessing warpdrv from another machine
- [KV Cache Checkpoints](docs/guides/kv-checkpoints.md) — saving and restoring slot state to skip prompt prefill

---

## Hardware Compatibility

### Tested Configurations

warpdrv works with any standard `llama-server` binary, so compatibility tracks llama.cpp's own support matrix.

### Backends

| Backend | Status |
|---------|--------|
| CUDA (NVIDIA) | Supported |
| ROCm (AMD) | Supported |
| Vulkan (any GPU) | Supported |
| CPU only | Supported |

### Notes

- Bring your own `llama-server` binary built against your hardware. The Recipe Engine can help compile one.
- Speculative decoding may not work with sliding-window-attention models.
- For GPU-specific build flags and runtime quirks, see the llama.cpp documentation for your target.

---

## FAQ

<!-- TODO local AI: tighten any answers, add more if obvious gaps -->

**Is this a daily-driver chat app?**
Depends. warpdrv is a workshop bench for testing models and llama.cpp builds. For polished daily chat, or coding, warpdrv's proxy server integrates seamless with your existing tools and workflows, and provides a customizable router using user-defined aliases.

**How does this differ from LM Studio / Ollama / Jan?**
Many server management apps bundle a fixed llama.cpp version and limits which models / quants work. warpdrv lets you bring your own llama.cpp builds — including bleeding-edge forks — and run them with full parameter control. Built for tinkerers, and also for end-users wanting a one-click chat app.

**Do I need to compile llama.cpp myself?**
No, but you can. warpdrv works with any standard `llama-server` binary. The Recipe Engine helps if you want to compile your own. Note: warpdrv does *not* ship with a llama binary, you have download one from the official github repo [LlaMa.cpp Releases](https://github.com/ggml-org/llama.cpp/releases).

**Where is my data stored?**
Linux: `~/.config/warpcore/` — chat database, settings, MCP config, recipes. Models stay wherever you put them; warpdrv only indexes them. Your data never leaves your computer.

**Can I use warpdrv commercially?**
warpdrv is licensed under AGPL-3.0. If you offer it as a network service, you must publish your modifications under AGPL. For commercial licensing without AGPL obligations, join the Discord and PM the mods.

**Why AGPL?**
To keep the project genuinely open: derivatives stay open, including SaaS forks.

**Does warpdrv send my data anywhere?**
No telemetry, no analytics, no remote calls — except the update-check ping to fetch `release.json` from the GitHub repo on startup.

**Why is X feature broken?**
Alpha software. File an issue with reproduction steps. Better yet, send a PR :)

**Who made this app?**
A combination of AIs and human effort by one software developer. AI used were local Qwen 3.5 27b, Qwen 3.5 27b, Qwen 3.6 35b, Claude Opus 4.6 for planning and skeletons. This app itself was used to host the local LLMs during development.

**How long did this take to build**
Approx. One week for MVP. One month for initial public release.

---

## Roadmap

- **Short-term**
  - Stabilise critical features (server stop, log parsing)
  - Windows prebuilt installer
- **Mid-term**
  - macOS prebuilt build (Apple Silicon)
  - Voice dictation in chat
- **Long-term**
  - Richer chat interface.

User feedback and feature requests are very welcome — drop them in [Discord](https://discord.gg/Q9kSKhY5), [Reddit](https://www.reddit.com/r/warpdrv/), or [GitHub Issues](https://github.com/mikjee/warpdrv/issues).

---

## For Developers

### Architecture

warpdrv is a Tauri desktop app wrapping a Node.js server and a React frontend. The Tauri shell spawns the Node server as a sidecar binary on launch, monitors its health, and restarts it on crash. The React app talks to the server over HTTP + SSE.

### Tech Stack

- **Desktop shell** — Tauri 2 (Rust)
- **Frontend** — React 19, Chakra UI v3, Vite, Zustand, assistant-ui
- **Server** — Node 24, Express 5, better-sqlite3, better-sse
- **Bundling** — esbuild + `@yao-pkg/pkg` (server binary), Vite (frontend)
- **Shared types** — TypeScript-only `@warpcore/shared` package

### Monorepo Structure

```
packages/
  shared/   @warpcore/shared   — Types, enums, utilities. No runtime deps.
  app/      @warpcore/app      — React frontend.
  server/   @warpcore/server   — Express + SQLite. Process management, GGUF parsing, recipes.
  bridge/   @warpcore/bridge   — Composable chat engine (extracted, used internally).
  desktop/                     — Tauri shell + release scripts.
```

### Build From Source

**Prerequisites:**

- Node 24+
- Rust + Cargo (for Tauri)
- Linux: standard Tauri dependencies — see [Tauri prerequisites](https://tauri.app/start/prerequisites/)

**Steps:**

```bash
git clone https://github.com/mikjee/warpdrv.git
cd warpdrv
npm install
```

**Run in dev mode:**

The recommended way is via VSCode. Open the repo, go to the **Run and Debug** panel, pick the `warpdrv-all` launch config, and hit play. All packages launch in a single integrated terminal.

If you don't use VSCode, run the same thing manually:

```bash
npm run dev
```

**Release build:**

```bash
./release.sh                    # Linux .deb (default)
./release.sh deb appimage       # both .deb and .AppImage
./release.sh appimage           # AppImage only
```

Bundle formats supported by Tauri: `deb`, `appimage`, `rpm`, `dmg`, `msi`, `nsis`, `updater`. Pass any combination to `release.sh`.

Artifacts land in `packages/desktop/target/release/bundle/`.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, conventions, and PR rules.

- Look for [`good first issue`](https://github.com/mikjee/warpdrv/issues?q=label%3A%22good+first+issue%22) labels
- All commits must be signed off (`git commit -s`) per the [Developer Certificate of Origin](https://developercertificate.org/)
- Follow the codebase conventions: hard tab indent, `T`/`I`/`E` type prefixes, `Record<>` over `Map`, no `any`

---

## Community & Support

- **Discord** — [discord.gg/Q9kSKhY5](https://discord.gg/Q9kSKhY5) (newly created, help shape it)
- **Reddit** — [r/warpdrv](https://www.reddit.com/r/warpdrv/)
- **Issues** — [GitHub Issues](https://github.com/mikjee/warpdrv/issues)
- **Discussions** — [GitHub Discussions](https://github.com/mikjee/warpdrv/discussions)

---

## Acknowledgements

Thanks to the following projects and their developers/maintainers for enabling developers to create wonderful Open-Source projects:

- [llama.cpp](https://github.com/ggml-org/llama.cpp) — Georgi Gerganov and contributors
- [Tauri](https://tauri.app/) — desktop shell framework
- [assistant-ui](https://github.com/Yonom/assistant-ui) — chat UI primitives
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3), [better-sse](https://github.com/MatthewWid/better-sse), [Express](https://expressjs.com/), [React](https://react.dev/), [Chakra UI](https://chakra-ui.com/), [Vite](https://vitejs.dev/), [Zustand](https://zustand-demo.pmnd.rs/)
- All beta testers and early users

## Sponsor

warpdrv is built and maintained by me, a solo dev. Consider supporting my open-source work - it helps in funding the hardware and fuels the late-night coding sessions 🤓

[![Sponsor](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ff69b4?logo=github)](https://github.com/sponsors/mikjee)

---

## License

warpdrv is licensed under the **GNU Affero General Public License v3.0** — see [LICENSE](LICENSE).

In plain English:

- Free for personal, hobbyist, and internal commercial use
- Modifications must be shared under AGPL if you distribute or run as a network service
- Original copyright notices must be preserved
- No royalties owed; no warranty provided

For commercial licensing without AGPL obligations, join the [Discord](https://discord.gg/Q9kSKhY5) and PM the mods.
