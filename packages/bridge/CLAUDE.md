# WarpBridge — Current State & Frontend Integration Guide

This document describes the current state of the `@warpcore/bridge` package after the broadcaster refactor, the API surface, the purpose of each file, and how the WarpCore frontend should integrate with it.

---

## 1. Architectural Overview

Bridge is the single source of truth for chat state. It owns:

- All message IDs (user, assistant, tool) — **bridge never accepts external IDs**
- The message tree (parentId references)
- Thread lifecycle (auto-creates threads on first completion)
- Inference orchestration (streaming to llama-server)
- Tool call lifecycle (MCP execution, approval flow)
- Broadcasting all state changes via a global SSE channel

The frontend is a **dumb client**. It does not:

- Generate message IDs
- Optimistically update local state
- Decide where messages attach in the tree
- Parse streaming inference responses directly

The frontend does:

- Subscribe to the bridge's global SSE event channel at app start
- Mirror bridge events into a Zustand store
- Trigger actions via POST endpoints (completions, cancel, tool approval)
- Render from the Zustand store

---

## 2. Event Flow

### Core principle

Bridge emits two classes of events:

- **Checkpoint events** (`message.patched`, `message.created`, `tool_call.created`, `tool_call.updated`, `inference.started`, `inference.ended`, `thread.*`) — these carry full authoritative state. A frontend that consumes only checkpoint events will always have correct state.

- **Progress events** (`message.chunk`) — these carry streaming deltas for live typing effect. Consumption is **optional**. Ignoring them entirely still yields correct state via the checkpoint patches.

### Event sequence for a normal turn (no tools)

1. `message.created` — user message (if `userMessage.content` was provided in the request)
2. `message.created` — assistant message (empty content)
3. `inference.started` — assistantMessageId
4. `message.patched` — declares a new text or reasoning part with empty text (provides its `partId`)
5. `message.chunk` × N — deltaText for that partId (optional to consume)
6. `message.patched` — final checkpoint with `replaceParts` carrying the full message state and `stats`
7. `inference.ended` — assistantMessageId

### Event sequence for a turn with tool calls (auto-executed)

1. `message.created` — user (if provided)
2. `message.created` — assistant
3. `inference.started`
4. `message.patched` + `message.chunk` — reasoning/text as above
5. `tool_call.created` — tool call row created, status PENDING
6. `message.patched` — assistant message gets a tool_call part appended
7. `message.created` — tool message, chained off the previous tool message (or the assistant for the first one)
8. `tool_call.updated` — EXECUTING
9. `tool_call.updated` — COMPLETED or ERROR
10. Steps 5-9 repeat for each tool call in the assistant's batch
11. `message.patched` — final checkpoint on the assistant message
12. `inference.ended` — the first assistant messageId
13. `message.created` — **new** assistant message, parentId = the last tool message id
14. `inference.started` — the new assistant messageId
15. (recursive — step 4 onwards for the new assistant message)
16. Eventually, a pass completes with no tool calls → normal end sequence

### Event sequence for a turn with tool calls (requires approval)

1-11. Same as above through the `message.patched` checkpoint on the assistant
12. `inference.ended` — assistant messageId

**Bridge stops here.** No further events until the user approves/denies.

When user approves via `POST /tool-calls/:id/resume`:

1. `tool_call.updated` — EXECUTING
2. `tool_call.updated` — COMPLETED/ERROR/DENIED
3. Bridge checks: are all sibling tool calls in the same chain resolved?
4. If yes: `message.created` for new assistant child of last tool message, `inference.started`, etc.
5. If no: bridge waits for remaining approvals

### Tool message chaining rule

**Tool messages chain linearly off the assistant message, not as siblings.**

Example: assistant emits 3 tool calls `A`, `B`, `C`:

```
assistant
  └── toolMsg(A)
        └── toolMsg(B)
              └── toolMsg(C)
                    └── next assistant (only created after all 3 resolve)
```

**NOT** this (wrong):

```
assistant
  ├── toolMsg(A)
  ├── toolMsg(B)
  └── toolMsg(C)
```

The linear chain preserves a single canonical message order and avoids sibling branching for what is semantically one turn.

### Thread creation

Bridge auto-creates a thread if the `threadId` in a completions request doesn't exist. A `thread.created` event fires. The frontend does **not** need to call a separate "create thread" endpoint before the first message.

---

## 3. Bridge API

### Completions endpoint

`POST /api/chat/completions` — fire-and-forget. Returns `{ok: true}` immediately. All updates flow via the SSE event channel.

Request body (`ICompletionRequest`):

```typescript
{
 threadId: string;                        // required; auto-creates thread if not found
 userMessage?: { content: string };       // optional; if present, bridge creates user message
 parentId?: string | null;                // parent of the new user message, or for regen/continue
 serverId: string;                        // llama-server instance to target
 messages: Array<{ role, content, ... }>; // conversation history for inference context
 systemPrompt?: string;
 inferenceParams: Record<string, unknown>;
}
```

Semantics:

- `userMessage` present, `parentId` set → new user message attached at `parentId`, assistant response attached below
- `userMessage` present, `parentId` null → first message in thread
- `userMessage` absent, `parentId` set → regen/continue; new assistant message attached at `parentId`
- `userMessage` absent, `parentId` null → invalid (no-op)

Concurrency: a new completion request for a thread that already has one in flight aborts the previous one.

### Cancel endpoint

`POST /api/chat/cancel/:threadId` — aborts any in-flight completion for the thread. Returns `{ok: true}`.

### Tool approval endpoint

`POST /api/chat/tool-calls/:id/resume` — approve or deny a pending tool call.

Request body:

```typescript
{
 decision: 'approve' | 'deny';
 threadId: string;
 serverId: string;
 messages: Array<{ role, content, ... }>;
 systemPrompt?: string;
 inferenceParams: Record<string, unknown>;
}
```

Fire-and-forget like completions. All updates flow via SSE. The bridge will trigger the next inference pass automatically once all sibling tool calls in the chain are resolved.

### Event channel

`GET /api/chat/events` — SSE channel, opened once at app start, never closes. All bridge events for all threads flow through this channel. The frontend filters by threadId in its Zustand store.

Event shape (discriminated union on `type`):

```typescript
type IBridgeEvent =
 | { type: 'thread.created'; thread: IChatThread }
 | { type: 'thread.updated'; thread: IChatThread }
 | { type: 'thread.deleted'; threadId: string }
 | { type: 'message.created'; message: IChatMessage }
 | { type: 'message.patched'; messageId: string; threadId: string; updates: IMessagePatch }
 | { type: 'message.deleted'; messageId: string; threadId: string }
 | { type: 'message.chunk'; messageId: string; threadId: string; partId: string; partType: 'text' | 'reasoning'; deltaText: string }
 | { type: 'tool_call.created'; toolCall: IToolCall }
 | { type: 'tool_call.updated'; toolCall: IToolCall }
 | { type: 'inference.started'; threadId: string; messageId: string }
 | { type: 'inference.ended'; threadId: string; messageId: string };

interface IMessagePatch {
 stats?: IChatMessageStats;
 addParts?: IMessagePart[];      // upsert by part id
 replaceParts?: IMessagePart[];  // full replacement
}
```

Each SSE message has an `event` field matching the `type` discriminator, so clients can register per-type handlers if they prefer.

### Other existing routes

- `GET /api/chat/threads` — list threads (with optional search/sort/filter query params)
- `GET /api/chat/threads/:id` — fetch thread + messages
- `POST /api/chat/threads` — create thread explicitly (rarely needed now)
- `PUT /api/chat/threads/:id` — rename / move / update
- `DELETE /api/chat/threads/:id` — delete
- `PUT /api/chat/messages/:id` — edit message parts
- `DELETE /api/chat/messages/:id` — delete message
- `GET /api/chat/threads/:id/tool-calls` — list tool calls for a thread
- `GET /api/chat/threads/:id/config` — fetch per-thread config (system prompt, params, preset)
- `PUT /api/chat/threads/:id/config` — update per-thread config
- `GET /api/chat/folders`, `POST /api/chat/folders`, etc. — folder CRUD

These routes are CRUD and don't currently fire broadcaster events. They will need to in a future iteration so other clients see edits in real time. For the initial FE integration, treat them as one-shot and refetch the relevant thread state after each call.

---

## 4. Bridge File Layout

### `packages/bridge/src/types/index.ts`

Type definitions for all bridge entities. Key exports:

- `TThreadId`, `TMessageId`, `TToolCallId`, `TMessagePartId` — branded string types for IDs
- `EChatRole` — USER, ASSISTANT, SYSTEM, TOOL
- `EMessagePartType` — TEXT, REASONING, TOOL_CALL
- `EToolCallStatus` — PENDING, EXECUTING, COMPLETED, ERROR, DENIED
- `EToolApprovalMode` — ALLOWED, ASK, DENIED
- `IChatThread`, `IChatMessage`, `IMessagePart`, `IToolCall` — entity shapes
- `IChatMessageStats` — prompt/completion token counts, timings
- `ICompletionRequest` — completions endpoint body shape
- `ICompletionUserMessage` — `{ content: string }`. No id; bridge generates.
- `IBridgeEvent` — the event union described above
- `IMessagePatch` — the patch shape used in `message.patched` events

### `packages/bridge/src/types/interfaces.ts`

Injectable interfaces for dependency composition:

- `IPersistence` — database layer (create/get/update/delete for threads, messages, tool calls)
- `IMcpClient` — MCP server management (list tools, execute tool calls, find server for tool)
- `IPermissions` — per-tool approval mode lookup
- `ITransport` — client-side interface for frontends calling bridge (uses SSE/fetch). Separate from the server-side broadcaster.
- `IBridgeBroadcaster` — server-side event fan-out:

  ```typescript
  interface IBridgeBroadcaster {
      emit(event: IBridgeEvent): void;
      subscribe(handler: (event: IBridgeEvent) => void): () => void;
      getNative?(): unknown;
  }
  ```

### `packages/bridge/src/persistence/betterSqlite.ts`

`BetterSqlitePersistence` — the production `IPersistence` implementation using `better-sqlite3`. WAL mode, foreign keys off for flexibility, no `ORDER BY createdAt` in message fetch (uses parentId chain traversal instead). Schema matches the WarpCore `chat.db` structure.

Tables:

- `threads` — id, title, folderId, systemPrompt, meta, totalPromptTokens, totalCompletionTokens, createdAt, updatedAt
- `folders` — id, name, parentFolderId, orderIndex, createdAt, updatedAt
- `messages` — id, threadId, parentId, role, stats, createdAt
- `message_parts` — id, messageId, type, orderIndex, text, toolCallId
- `tool_calls` — id, messageId (points at tool message, not assistant), threadId, serverName, toolName, arguments, result, status, error, createdAt, resolvedAt
- `thread_configs` — threadId, presetId, systemPrompt, params
- `mcp_server_permissions`, `mcp_tool_permissions` — approval policy storage

### `packages/bridge/src/broadcaster/sseBroadcaster.ts`

`SseBroadcaster` — default `IBridgeBroadcaster` implementation using `better-sse`. Wraps a `Channel` for HTTP session fan-out. Also maintains an in-process subscriber set for local listeners.

HTTP routes register sessions directly via `broadcaster.getChannel().register(session)`.

### `packages/bridge/src/orchestrator/index.ts`

The core inference orchestrator. Consumes `IPersistence`, `IMcpClient`, `IPermissions`, `IBridgeBroadcaster`. Key methods:

- `handleCompletion(inferenceUrl, request, abortSignal)` — entry point. Auto-creates thread, saves user message if provided, then calls `executePass` to run inference.

- `executePass(inferenceUrl, request, parentId, messages, enabledTools, abortSignal)` — **one-shot, not a loop**. Creates one new assistant message as a child of `parentId`, emits `inference.started`, runs `runPass`, emits the final checkpoint `message.patched` and `inference.ended`, then:
  - If the pass needs approval → returns, waits for resume
  - If no tool calls fired → returns, done
  - If tool calls auto-resolved → **recursively** calls itself with the new assistant message parented at the last tool message. This is recursion, not iteration.

- `runPass(...)` — **one inference pass** against llama-server. Streams tokens, persists text/reasoning parts, emits `message.chunk` and incremental `message.patched` events. When the model emits tool calls, creates tool_call rows and tool messages (chained linearly), and either executes them inline (ALLOWED) or returns early with `needsAsk = true` (ASK). Returns `{hadToolCalls, needsAsk, lastToolMessageId}`.

- `resumeToolCall(toolCallId, decision, inferenceUrl, request, abortSignal)` — called by the approval route. Updates the tool call status, broadcasts, then walks up the tool message chain to check if any sibling tool calls are still PENDING or EXECUTING. If all resolved, calls `executePass` with parent = `tc.messageId` (the tool message) to trigger the next inference pass. If not all resolved, returns silently.

- `createAssistantMessage`, `flushTextPart`, `flushReasoningPart`, `buildInferenceParams` — helpers.

No `res: Response` parameter anywhere. No direct SSE writes. All output goes through `this.broadcaster.emit(...)`.

### `packages/bridge/src/parser.ts`

SSE parsing for the llama-server upstream response, and tool call delta accumulation. Exposes `parseSSEBuffer`, `accumulateToolCallDelta`, `finalizeToolCalls`.

### `packages/bridge/src/validation.ts`

JSON schema validation for tool arguments (`validateToolArgs`) and schema cleanup for the OpenAI tool format (`cleanSchema`).

### `packages/bridge/src/index.ts`

Public exports. Re-exports types, interfaces, `Orchestrator`, `BetterSqlitePersistence`, `SseBroadcaster`, transports.

---

## 5. Server Integration

`packages/server/src/index.ts`:

- Instantiate `SseBroadcaster` as a singleton
- Pass it into the `Orchestrator` constructor alongside `persistence`, `mcpClient`, `permissions`
- Export the broadcaster for routes to consume

`packages/server/src/routes/chat.ts`:

- `POST /completions` — fire-and-forget. Tracks in-flight `AbortController` per thread; new requests abort previous. Returns `{ok: true}` immediately. Calls `orchestrator.handleCompletion()` without awaiting.
- `POST /cancel/:threadId` — looks up the AbortController, aborts, deletes from map.
- `POST /tool-calls/:id/resume` — fire-and-forget. Reconstructs an `ICompletionRequest` from the request body and calls `orchestrator.resumeToolCall()`.
- `GET /events` — opens a `better-sse` session, registers it on `broadcaster.getChannel()`. Never closes normally; closes on client disconnect.

All existing CRUD routes remain as-is.

---

## 6. Frontend Integration

This section describes how the WarpCore frontend should integrate with the new bridge. It has **not been implemented yet** — the current ChatPage uses the old `useLocalRuntime` + `HistoryProvider` + `ChatModelAdapter` approach, which needs to be replaced.

### 6.1 Goals

- Frontend never generates message IDs
- Frontend never optimistically updates state
- All state changes flow through the SSE event channel into a Zustand store
- Render from the Zustand store via assistant-ui's `useExternalStoreRuntime`
- Tool role messages are **not filtered out** — they are part of the message chain and must be preserved for correct parent references. They are rendered via a dedicated component showing the tool call via `ToolCallBlock`.

### 6.2 Zustand store design

Add a new `chat` slice to the existing Zustand store. Shape:

```typescript
interface IChatSlice {
    // keyed by threadId
    messagesByThread: Record<TThreadId, Record<TMessageId, IChatMessage>>;
    // flat map of all tool calls (keyed by tool call id)
    toolCallsById: Record<TToolCallId, IToolCall>;
    // flat map of all threads (includes thread metadata, not messages)
    threads: Record<TThreadId, IChatThread>;
    // per-thread inference state
    isRunningByThread: Record<TThreadId, boolean>;

    // actions (called by the SSE subscriber)
    applyThreadCreated: (thread: IChatThread) => void;
    applyThreadUpdated: (thread: IChatThread) => void;
    applyThreadDeleted: (threadId: TThreadId) => void;
    applyMessageCreated: (message: IChatMessage) => void;
    applyMessagePatched: (messageId: TMessageId, threadId: TThreadId, updates: IMessagePatch) => void;
    applyMessageDeleted: (messageId: TMessageId, threadId: TThreadId) => void;
    applyMessageChunk: (messageId: TMessageId, threadId: TThreadId, partId: TMessagePartId, deltaText: string) => void;
    applyToolCallCreated: (toolCall: IToolCall) => void;
    applyToolCallUpdated: (toolCall: IToolCall) => void;
    applyInferenceStarted: (threadId: TThreadId, messageId: TMessageId) => void;
    applyInferenceEnded: (threadId: TThreadId, messageId: TMessageId) => void;

    // one-shot seed from initial fetch
    seedThreadMessages: (threadId: TThreadId, messages: IChatMessage[]) => void;
}
```

Key implementation notes:

- **`applyMessagePatched` with `addParts`** does upsert-by-part-id. If the part id exists, replace it in place. Otherwise append. This allows the orchestrator to declare a part once with empty text, then send chunks to fill it in.
- **`applyMessagePatched` with `replaceParts`** does full replacement of the content array.
- **`applyMessageChunk`** locates the part by id in the target message and appends `deltaText` to its `text` field. If the part doesn't exist yet (chunk arrived before the declaring patch, shouldn't happen but defensive), create it.
- The checkpoint patch at the end of each pass (with `replaceParts` + `stats`) should be the source of truth — chunks are just for live streaming feel.
- **Messages are stored as a flat map**, not an array, because they form a tree via parentId. The component layer builds the linear display order by walking the chain.

### 6.3 SSE subscriber hook

Use the `eventsource` npm package (same pattern as the existing control API SSE implementation in WarpCore) rather than browser-native `EventSource`, so auth headers work if needed.

```typescript
// src/hooks/useChatEventsStream.ts
import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useStore } from '../store';

export function useChatEventsStream() {
    const apply = useStore(s => ({
        applyThreadCreated: s.applyThreadCreated,
        applyMessageCreated: s.applyMessageCreated,
        applyMessagePatched: s.applyMessagePatched,
        // ... all the apply actions
    }));

    useEffect(() => {
        const es = new EventSource('/api/chat/events');

        const handleEvent = (e: MessageEvent) => {
            const event = JSON.parse(e.data) as IBridgeEvent;
            switch (event.type) {
                case 'thread.created': apply.applyThreadCreated(event.thread); break;
                case 'message.created': apply.applyMessageCreated(event.message); break;
                case 'message.patched': apply.applyMessagePatched(event.messageId, event.threadId, event.updates); break;
                case 'message.chunk': apply.applyMessageChunk(event.messageId, event.threadId, event.partId, event.deltaText); break;
                // ... every case
            }
        };

        // Register per-event-type listeners (better-sse tags each message with its event name)
        es.addEventListener('message.created', handleEvent);
        es.addEventListener('message.patched', handleEvent);
        // ... etc

        es.onerror = (err) => {
            console.error('[ChatEventsStream] error', err);
            // EventSource auto-reconnects by default
        };

        return () => { es.close(); };
    }, []);
}
```

Call this hook once at the top level of the app (in a provider component), not per-thread. The subscription is global.

### 6.4 Initial thread load

When the user switches to a thread, fetch its current state once and seed the store:

```typescript
const res = await fetchThread(threadId);
if (res.ok) {
    useStore.getState().seedThreadMessages(threadId, res.data.messages);
    // also seed toolCallsById via fetchThreadToolCalls
}
```

After seeding, all further updates come via the SSE stream.

### 6.5 assistant-ui integration via `useExternalStoreRuntime`

Replace `useLocalRuntime` + `useRemoteThreadListRuntime` + `HistoryProvider` with `useExternalStoreRuntime`. Pseudo-setup:

```typescript
const runtime = useExternalStoreRuntime({
    messages: useStore(s => selectActiveMessages(s, activeThreadId)),
    isRunning: useStore(s => s.isRunningByThread[activeThreadId] ?? false),
    onNew: async (message) => {
        // message.content is what the user typed
        const content = extractText(message.content);
        const lastMessageId = getLastMessageId(activeThreadId);
        await fetch('/api/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                threadId: activeThreadId,
                userMessage: { content },
                parentId: lastMessageId,
                serverId: currentServerId,
                messages: buildInferenceMessages(activeThreadId),
                systemPrompt: activeSystemPrompt,
                inferenceParams: activeInferenceParams,
            }),
        });
        // no optimistic update — SSE will populate the store
    },
    onEdit: async (message) => {
        await fetch(`/api/chat/messages/${message.id}`, { method: 'PUT', ... });
        // trigger a regen after edit
    },
    onReload: async (parentId) => {
        await fetch('/api/chat/completions', {
            method: 'POST',
            body: JSON.stringify({
                threadId: activeThreadId,
                parentId, // regen from this parent
                serverId, messages, systemPrompt, inferenceParams,
            }),
        });
    },
    convertMessage,
});
```

**`selectActiveMessages`** walks the parentId chain from the newest leaf back to the root, then reverses to get the display order. Tool role messages are kept in the chain but converted into something assistant-ui can render (see next section).

**`convertMessage`** maps `IChatMessage` (with bridge's message part format) into assistant-ui's `ThreadMessage` format. For TOOL role messages, convert them into an assistant-ui tool-call part so they render via `ToolCallBlock`.

### 6.6 Tool role messages — do not filter

Tool role messages **must stay in the message chain** because they are real parents of subsequent assistant messages. Filtering them out breaks the parentId chain.

For rendering, `convertMessage` treats a TOOL role message as if it were an assistant message containing a single tool-call part. The tool-call part reads status and result from `toolCallsById[toolCallId]` in the Zustand store. `ToolCallBlock` displays the status, arguments, result, and approval buttons.

Assistant messages also have tool_call parts (as references to the same tool calls), but those are for llama-server's bookkeeping. On the display side, you can either:

- Render the tool_call from the tool role message (canonical, has the result)
- OR render it from the assistant message's part (has only the reference id)

The tool role message is the better source since it's where the result lives logically.

### 6.7 Approval flow

When the user clicks approve/deny in `ToolCallBlock`:

```typescript
await fetch(`/api/chat/tool-calls/${toolCallId}/resume`, {
    method: 'POST',
    body: JSON.stringify({
        decision: 'approve', // or 'deny'
        threadId: activeThreadId,
        serverId: currentServerId,
        messages: buildInferenceMessages(activeThreadId),
        systemPrompt: activeSystemPrompt,
        inferenceParams: activeInferenceParams,
    }),
});
// SSE will stream the rest
```

Again, no optimistic update. The `tool_call.updated` event will come through SSE and update the store.

### 6.8 Thread list

The `useRemoteThreadListRuntime` wrapper from assistant-ui is gone. Manage the thread list yourself from the Zustand `threads` slice:

- Initial fetch populates threads from `GET /api/chat/threads`
- `thread.created` / `thread.updated` / `thread.deleted` events keep it in sync
- A sidebar component renders the list from `useStore(s => Object.values(s.threads))`
- Active thread ID lives in the store; switching is a single-field update
- Rename, delete, folder assignment — POST to the existing CRUD routes, then rely on events (once CRUD routes emit events) or manually refetch

### 6.9 Potential fallback: drop assistant-ui runtime entirely

`useExternalStoreRuntime` is designed for flat message arrays. Its support for tree-structured branching via parentId is not well-documented, and our bridge uses a tree model (with branches from edits, regens, and the tool message chain).

**If `useExternalStoreRuntime` becomes a blocker** — e.g., it refuses to render tree-shaped state, breaks on parentId cycles that look like branches, or doesn't let us control display order — the fallback is to **drop assistant-ui's runtime entirely** and use only its primitive components (`Thread`, `MessagePrimitive`, `Composer`, etc.) directly.

In that mode:

- We manage all message state in Zustand ourselves
- We render a list of messages by mapping the selected active branch and dropping each into an assistant-ui primitive
- We wire up the composer's submit handler manually to POST to `/completions`
- We lose assistant-ui's built-in features like branch switching UI, reload buttons, edit mode — but we can rebuild those with our own buttons that POST to the right endpoints

This has not been explored yet. It is an escape hatch, not a plan. If `useExternalStoreRuntime` works, stay with it. Only drop down if forced.

---

## 7. Key Rules (do not violate)

1. **Bridge owns all message IDs.** Frontend never generates them. Frontend never sends an `id` field in any create request.
2. **Bridge dictates the message tree.** Frontend sends `parentId` as a hint for where to attach, but bridge decides the final structure.
3. **Frontend never optimistically updates.** State only changes in response to SSE events. The user action (button click, submit) POSTs to bridge and waits.
4. **Tool role messages are part of the chain.** Never filter them out on the frontend. Display logic transforms them for rendering without removing them from the parent chain.
5. **Tool messages chain linearly.** The first tool message's parent is the assistant; subsequent tool messages' parents are the previous tool message. The next assistant message's parent is the last tool message.
6. **No loops in the orchestrator.** Multi-pass inference (auto-continue after tool execution) is done via recursion in `executePass`, not iteration. Each invocation handles exactly one assistant message.
7. **Checkpoint events are authoritative.** Streaming chunks are optional. A frontend that drops all chunks and only consumes checkpoint events must still display correct final state.
8. **File deletion rule.** When writing shell commands for this project, never use `rm -rf` or `rm -f`. Only `rm -r` for directories or `rm` for single files. No force flags.