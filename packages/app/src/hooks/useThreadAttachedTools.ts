import { useCallback, useEffect } from 'react';
import { useStore } from '../store';

export function useThreadAttachedTools() {
	const currentThreadId = useStore(s => s.currentThreadId);
	const setAttachedTools = useStore(s => s.setAttachedTools);

	const loadAttachedTools = useCallback(async (threadId: string | null) => {
		if (!threadId) {
			setAttachedTools(false, []);
			return;
		}

		const res = await fetch(`/api/mcp/attached-tools/thread/${threadId}`);
		if (res.ok) {
			const response = await res.json();
			const data = response.data;
			if (data) {
				setAttachedTools(data.attachAllTools, data.tools);
			} else {
				setAttachedTools(false, []);
			}
		} else {
			setAttachedTools(false, []);
		}
	}, [setAttachedTools]);

	useEffect(() => {
		loadAttachedTools(currentThreadId);
	}, [currentThreadId, loadAttachedTools]);
}
