# Backend Groups

## What is a backend group

A backend group is a bucket of interchangeable backends with exactly one marked **active**. When a server is configured to use a group instead of a specific backend, the server uses whichever backend is currently active in that group.

Servers reference the group, not the individual backends inside it. Swap the active backend, and every server that uses the group picks up the new one.

## Why use a group instead of a direct backend

When you launch a server, you have two choices: point it at a specific backend, or point it at a group.

A direct reference is simple but rigid — change the backend (e.g. you build a fresh dated llama.cpp), and you have to edit every server that used the old one. With a group, you add the new build to the group, mark it active, and every server using that group switches over the next time it starts.

This is the main point of groups: rotating builds without touching server configs. The same group can hold a CUDA build, a ROCm build, and a Vulkan build for different GPUs, or two different dated CUDA builds where you're A/B-testing performance.

## Setting up groups

Open the Backends page. Each group has a name and a list of backends, with one marked active.

- **Create a group** — name it, pick which backends to include, pick which one is active
- **Edit a group** — add or remove backends, rename
- **Switch the active backend** — click another backend in the group; it becomes active immediately
- **Delete a group** — removes the group only; the backends inside it are untouched

Switching the active backend is always manual. warpdrv does not auto-switch on failure.

## What happens to running servers when you switch active

If you change the active backend on a group that has running servers, warpdrv shows a dialog:

- **Restart all affected servers now** — they stop and re-launch using the newly active backend
- **Keep them running** — they continue on the old backend and pick up the new one on their next launch

Pick whichever fits the moment. There's no wrong answer.

## Direct backend vs group at launch

The launch dialog lets you pick either. Use a direct backend when the server is one-off and tied to a specific build. Use a group when the server is something you'll keep around long-term and you expect the underlying build to change over time.
