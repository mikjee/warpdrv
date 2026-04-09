import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { TThreadId } from '@warpcore/bridge';

export function useThreadConfig(threadId: TThreadId | null) {
	console.log('useThreadConfig hook called with threadId:', threadId);
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Refs to track last fetched values - prevents unnecessary updates
	const lastFetchedPromptRef = useRef<string>('');
	const lastFetchedParamsRef = useRef<string>('{}');

	useEffect(() => {
		console.log('useThreadConfig effect running for threadId:', threadId);
		if (!threadId) return;

		async function loadConfig() {
			const res = await fetch(`/api/chat/threads/${threadId}/config`);
			if (res.ok) {
				const data = await res.json();
				
				// Only update if values actually differ from last fetched
				const newPrompt = data.systemPrompt ?? '';
				if (newPrompt !== lastFetchedPromptRef.current) {
					setCurrentSystemPrompt(newPrompt);
					lastFetchedPromptRef.current = newPrompt;
				}
				
				const newParamsStr = JSON.stringify(data.params || {});
				if (newParamsStr !== lastFetchedParamsRef.current) {
					setCurrentInferenceParams(data.params || {});
					lastFetchedParamsRef.current = newParamsStr;
				}
			}
		}

		loadConfig();
	}, [threadId]);
}
