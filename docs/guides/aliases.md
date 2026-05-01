# Aliases

## What is an alias

An alias is a routing address for a server. warpdrv runs an OpenAI-compatible proxy on a configurable port (default `1234`), and clients send requests there with `"model": "<alias>"`. The proxy reads that field and forwards the request to a server holding the matching alias.

A server can carry any number of aliases, and the same alias can exist on multiple servers at once. Aliases are part of the server's config, not the model file — the same `.gguf` loaded into two different servers can carry completely different aliases.

## Why use aliases

The proxy is the single endpoint your clients talk to. Aliases are how you decide what each server answers to behind it.

A common setup: you have Qwen 27B in two quants and want both available.

- Server A: `Q6_K_XL` on the RTX Pro 5000 — aliases `qwen-27b`, `qwen-27b-cuda`
- Server B: `MXFP4` on the Strix Halo iGPU — aliases `qwen-27b`, `qwen-27b-rocm`

A client calling `qwen-27b` reaches whichever server is online — useful when you only run one at a time and want clients to stay configured. Calling `qwen-27b-cuda` always reaches A; calling `qwen-27b-rocm` always reaches B — useful when both are running and you want to target a specific one.

The same pattern works for any axis: backend, GPU, quant, context size, sampling preset. Add a generic alias for "whichever is up" and a specific alias per server for direct targeting.

## Setting aliases

Two places, same effect:

- **Launch server dialog** — aliases field while configuring a new server
- **Servers page** — each server shows its aliases as badges next to the server name with a `+` button to add more; click a badge to edit or remove

Aliases are free-form strings. Convention: short, lowercase, hyphenated.

## Using aliases from a client

Point the client at the proxy port and use the alias in the `model` field.

```bash
curl http://localhost:1234/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "qwen-27b",
        "messages": [{"role": "user", "content": "hello"}],
        "stream": true
    }'
```

`GET /v1/models` returns the list of currently routable aliases — the union of aliases across every running server.

For OpenAI-compatible clients (Open WebUI, LibreChat, Continue, Claude Code, llama-benchy, etc.) set the base URL to `http://localhost:1234/v1` and put the alias in the model field. No API key is required; any string works if the client demands one.

## Sticky routing

When two servers share an alias and both are online, the proxy locks the first request onto one of them and keeps routing there until that server stops. You don't get to choose which one is picked first.

To force a specific server when both are running:

- Stop the other server
- Use a unique alias (`qwen-27b-cuda` vs `qwen-27b-rocm`) instead of the shared one
- Clear the route manually from the Servers page or with `DELETE /api/proxy/routes/<alias>` — the next request re-picks

## Errors

- `404` — the alias isn't registered on any server. Check the spelling.
- `503` — the alias is registered but no server holding it is currently running. Start one.
- `502` — the target server isn't responding. The sticky route clears automatically; retry.
