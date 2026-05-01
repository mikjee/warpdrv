# Proxy, Remote Access, and Authentication

## Two ways to reach a running model

A llama.cpp server launched by warpdrv exposes its OpenAI-compatible API on its own port (auto-assigned from the configured port range, typically `8085+`). You have two options for hitting it:

**Direct.** Point your client at the server's port. One model per port. The address is fixed to that specific server — if you stop and re-launch, the port may change. Useful for quick local testing or when you only have one server running.

**Through the proxy.** Point your client at warpdrv's proxy on its configured port (default `1234`). The proxy reads the `model` field in the request and routes to whichever server holds that alias. The proxy needs aliases set up on your servers — without aliases, nothing is routable. See the Aliases doc for how to set those up.

Most clients (Open WebUI, Continue, Claude Code, llama-benchy, etc.) work better against the proxy because it gives you one stable endpoint regardless of which server is running.

## Authentication

warpdrv has two ports a client can hit:

- The **control API** on `4400` (default, override with `CONTROL_API_PORT`) — the warpdrv UI and everything behind it (server management, models, settings, recipes, etc.)
- The **proxy** on `1234` (default, configurable in settings) — the OpenAI-compatible inference endpoint

Each port has its own auth toggle. Both use bearer tokens — clients send `Authorization: Bearer <token>` and warpdrv looks up the token's hash in its config to find the permissions.

### Roles

A token has one role:

- **admin** — full access to the control API and the proxy. No restrictions.
- **inference** — only access to the proxy's `/v1/*` endpoints. Optionally scoped to specific aliases or server IDs. Can be `*` (all) or a list.

### Auth toggles

There are three independent settings:

- **Proxy auth** — when on, requests to `:1234` need a valid token (admin or inference). Applies to everyone, including localhost.
- **Control auth** — when on, remote (non-localhost) requests to `:4400` need an admin token. Localhost stays open.
- **Localhost auth (control)** — sub-toggle of control auth. When on, even localhost requests to `:4400` need an admin token. Useful if you don't trust other processes on the machine.

The proxy has no localhost exception — if proxy auth is on, every request needs a token. The control API treats localhost specially because the warpdrv UI itself runs against the control API and is usually loaded from `localhost:4400`.

## Managing tokens

Tokens are managed from the proxy page. The collapsible Access Tokens section shows a table of existing tokens — name, role, scope, created date — with edit and delete actions.

To create a token, click Create Token. Pick a role:

- **Admin** — no further config needed
- **Inference** — choose either all servers or pick specific aliases / server IDs

The token string is shown once on creation. Copy it then; you can't retrieve it later — only the hash is stored. If you lose it, delete the token and create a new one.

Editing changes permissions on an existing token. The token string itself isn't shown on edit.

## Remote access

By default warpdrv binds the control API and proxy on `0.0.0.0`, so they're reachable from any machine on the network. Browse to `http://<machine-ip>:4400` and you get the warpdrv UI.

If control auth is off, anyone on the network can use it — fine on a trusted home network, not fine on anything shared. Turn control auth on for any machine you don't have full physical control over. The UI will then prompt for an admin token before loading.

For inference from another machine (e.g. a coding tool on your laptop hitting warpdrv on your desktop), point the client at the desktop's IP and the proxy port:

```bash
curl http://<desktop-ip>:1234/v1/chat/completions \
    -H "Authorization: Bearer <inference-token>" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "qwen-27b",
        "messages": [{"role": "user", "content": "hello"}]
    }'
```

For OpenAI-compatible clients, set the base URL to `http://<desktop-ip>:1234/v1` and put the token in the API key field.
