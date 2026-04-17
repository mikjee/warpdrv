# Chat — MCP Tool Calls

Tool execution lifecycle through MCP servers during chat conversations.

## Overview

When an AI assistant needs to use external tools (search, file operations, API calls, etc.), it emits tool calls. WarpCore executes them through MCP servers and manages the approval flow.

## Key UI Elements

| Element | Description |
|---------|-------------|
| ToolCallBlock | Collapsible block within the assistant message showing tool name, arguments, and result |
| Status indicator | PENDING (amber dot), EXECUTING (spinner + "Running"), COMPLETED (checkmark), DENIED (ban icon + "Denied"), ERROR (alert + "Error") |
| Approve/Deny buttons | Appear for tools in PENDING state, allowing user to control execution |
| Arguments panel | Collapsible view of tool call arguments (JSON) |
| Result panel | Collapsible view of tool call result/output |
| ToolCallBlockWrapper | Reads actual status from the store to ensure correct display |

## How It Works

1. **Model emits tool calls**: During inference, the model may request to use one or more tools. A `tool_call.created` event is emitted with status PENDING.
2. **Approval**: If a tool has approval mode set to ASK, the user sees Approve/Deny buttons. If set to ALLOWED, the tool executes automatically.
3. **Execution**: On approve, the tool is executed via the MCP server. Status changes to EXECUTING, then COMPLETED or ERROR.
4. **Next pass**: After all tool calls resolve (COMPLETED, DENIED, or ERROR), the assistant generates a follow-up message incorporating the tool results.
5. **Tool chaining**: Tool messages chain linearly (not as siblings). Each tool's result is visible before the next tool executes.

## Tool Call Lifecycle

```
Model emits tool call
  → PENDING (waiting for approval)
    → User approves → EXECUTING → COMPLETED
    → User denies → DENIED
  → (auto-approved if ALLOWED) → EXECUTING → COMPLETED/ERROR
```

## Settings

| Setting | Description |
|---------|-------------|
| Tool approval mode | Set per-tool per-server: ALLOWED (auto-execute), ASK (require user approval), DENIED (never available) |
| Server permission | Enable/disable an entire MCP server. Disabled servers have no tools available |

## Key Behaviors

- **No optimistic updates**: Tool call state is never updated before receiving a server event. User actions (approve/deny) POST to the server and wait for the result
- **Single source of truth**: The Bridge orchestrator owns all tool call state. The UI only displays what the server reports
- **Multi-pass execution**: If tools auto-resolve, the assistant automatically generates a follow-up message. The user does not need to manually continue the conversation
- **Error handling**: Tool execution errors are shown inline. The user can see what went wrong and continue the conversation
- **Cross-server tools**: Tools from multiple MCP servers can be used within a single conversation turn
- **Permission isolation**: DENIED tools are filtered out during tool discovery — they never appear in the UI
