# Contributing to warpdrv

Thanks for considering a contribution. warpdrv is alpha software — bug reports, fixes, and small features are all welcome.

## Setup

```bash
git clone https://github.com/mikjee/warpdrv.git
cd warpdrv
npm install
```

Open the repo in VSCode, go to the **Run and Debug** panel, pick the `warpdrv-all` launch config, and hit play. All packages run in a single integrated terminal.

Prerequisites: Node 24+, Rust + Cargo (for Tauri), and the standard [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS.

## Sign your commits (DCO)

All commits must be signed off under the [Developer Certificate of Origin](https://developercertificate.org/). This certifies you wrote the code or have the right to submit it under the project's license.

Add `-s` to every commit:

```bash
git commit -s -m "fix: server stop hang on SIGTERM"
```

That appends a `Signed-off-by: Your Name <email>` line. Configure git once with your real name and email so the line is valid.

## Code conventions

- Hard tab indent (width 4)
- TypeScript: `T` prefix for type aliases, `I` for interfaces, `E` for enums (e.g. `TServerId`, `IBackend`, `EServerStatus`)
- Use `Record<>` over `Map`
- Use `enum` over union string literals where values are constants; enum values in `UPPER_SNAKE_CASE`
- `//` style comments only — no `/** */`, no JSDoc
- Single-line sub-blocks go on the same line as the `if` or `for`
- No `any`, avoid explicit type-casting
- No emojis or symbols in code or comments

## Pull requests

- One logical change per PR
- Include a clear description of what changed and why
- Reference the issue number if applicable (e.g. `Fixes #42`)
- Make sure the app still runs in dev mode before opening the PR

## License

By contributing, you agree your code will be licensed under [AGPL-3.0](LICENSE), the project's license.
