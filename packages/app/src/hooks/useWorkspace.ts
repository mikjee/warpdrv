import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { fetchWorkspaceState } from '@/api/services';

function applyDefaults(wsState: Record<string, unknown>) {
  const store = useStore.getState();
  if (wsState.defaultServerId) {
    store.setTempThreadServerId(wsState.defaultServerId as string);
  }
  if (wsState.defaultPresetId) {
    const preset = store.chatPresets.find(p => p.id === wsState.defaultPresetId);
    if (preset) store.setCurrentSystemPrompt(preset.systemPrompt);
  }
}

export function useWorkspace() {
  const activeWorkspaceId = useStore(s => s.activeWorkspaceId);
  const currentThreadId = useStore(s => s.currentThreadId);
  const threads = useStore(s => s.threads);
  const initWorkspaceState = useStore(s => s.initWorkspaceState);
  const workspaceState = useStore(s => activeWorkspaceId ? s.workspaceStates[activeWorkspaceId] : undefined);
  const loadedRef = useRef<Set<string>>(new Set());

  // Load workspace state when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (loadedRef.current.has(activeWorkspaceId)) return;
    (async () => {
      const res = await fetchWorkspaceState(activeWorkspaceId);
      if (res.ok && res.data !== null && res.data !== undefined) {
        initWorkspaceState(activeWorkspaceId, res.data);
        loadedRef.current.add(activeWorkspaceId);
        const state = useStore.getState();
        const isNew = !state.currentThreadId || !state.threads[state.currentThreadId];
        if (isNew) applyDefaults(res.data);
      }
    })();
  }, [activeWorkspaceId]);

  // Apply defaults when thread changes (new thread only)
  useEffect(() => {
    if (!currentThreadId || !activeWorkspaceId) return;
    if (threads[currentThreadId]) return;
    if (workspaceState && Object.keys(workspaceState).length > 0) {
      applyDefaults(workspaceState);
      return;
    }
    (async () => {
      const res = await fetchWorkspaceState(activeWorkspaceId);
      if (res.ok && res.data !== null && res.data !== undefined) {
        initWorkspaceState(activeWorkspaceId, res.data);
        loadedRef.current.add(activeWorkspaceId);
        applyDefaults(res.data);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThreadId, activeWorkspaceId, workspaceState]);
}
