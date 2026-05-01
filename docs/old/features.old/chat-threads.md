# Chat — Threads

Thread management for organizing conversations in the chat feature.

## Overview

Threads are individual conversations, each with their own message history, system prompt, and inference parameters. They are organized into folders for hierarchical organization.

## Key UI Elements

| Element | Description |
|---------|-------------|
| Thread list | Sidebar list of all threads, sorted by recency, with titles |
| New thread button | Creates a new thread (auto-named from first message) |
| Folder system | Folders for organizing threads, supports nesting via parent-child relationships |
| Thread actions | Rename, delete, move to folder via right-click menu or context menu |
| Thread config | System prompt and inference parameters (temperature, samplers, etc.) — shown in the chat config panel |

## How It Works

1. **Create**: A new thread is created automatically when you send your first message. You can also create empty threads from the sidebar.
2. **Rename**: Click the thread title in the sidebar to edit. Titles default to the first user message content.
3. **Organize**: Drag threads into folders, or use the context menu to assign a folder. Folders can be nested.
4. **Delete**: Delete threads from the sidebar context menu. This removes all messages permanently.
5. **Switch**: Click any thread in the sidebar to switch to it. Switching is instant — the thread data is always available (pages persist across navigation).

## Settings

| Setting | Description |
|---------|-------------|
| System prompt | Per-thread system prompt that defines the assistant's behavior. Set in the chat config panel |
| Presets | Per-thread inference parameter presets (temperature, top_p, samplers, etc.). Select from saved presets or create new ones |
| Token counts | Thread tracks prompt tokens, completion tokens, and total tokens — displayed in the thread header |

## Key Behaviors

- **Auto-creation**: Threads are created automatically on first message — no separate "new thread" step required
- **Message tree**: Threads maintain a message tree structure. Regenerating a message creates a branch from the parent message
- **Single source of truth**: Message state is dictated by the server. The UI only mirrors events from the server — no optimistic updates
- **Branching**: Regenerating a message creates a branch. The active branch is tracked and displayed. Switching branches shows different message histories
- **Real-time sync**: All clients connected to the same server see the same thread state via SSE events
