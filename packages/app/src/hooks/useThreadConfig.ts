import { useEffect } from 'react';
import { useStore } from '../store';
import type { TThreadId } from '@warpcore/bridge';

export function useThreadConfig(threadId: TThreadId | null) {
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);

	useEffect(() => {
		if (!threadId) return;

		setCurrentThreadId(threadId);

		async function loadConfig() {
			const res = await fetch(`/api/chat/threads/${threadId}/config`);
			if (res.ok) {
				const data = await res.json();
				setCurrentSystemPrompt(data.systemPrompt ?? '');
				setCurrentInferenceParams(data.params ?? {});
			}
		}

		loadConfig();
	}, [threadId, setCurrentSystemPrompt, setCurrentInferenceParams, setCurrentThreadId]);
}
