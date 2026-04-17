import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { TThreadId } from '@warpcore/bridge';
import { DEFAULT_INFERENCE_PARAMS } from '@/components/ChatConfigSidebar';

export function useThreadConfig(threadId: TThreadId | null) {
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Ref to track last fetched params — prevents re-updating on re-renders
	const lastFetchedParamsRef = useRef<string>('');

	useEffect(() => {
		if (!threadId) return;

		// Reset ref when threadId changes so the new thread's config is always applied
		lastFetchedParamsRef.current = '';

		async function loadConfig() {
			const res = await fetch(`/api/chat/threads/${threadId}/config`);
			
			if (!res.ok) {
				// API error — reset to defaults
				setCurrentInferenceParams({ ...DEFAULT_INFERENCE_PARAMS });
				setCurrentSystemPrompt('');
				lastFetchedParamsRef.current = JSON.stringify(DEFAULT_INFERENCE_PARAMS);
				return;
			}
			
			const data = await res.json();
			const config = data.data;
			
			if (!config) {
				// No saved config (new thread) — reset to defaults
				setCurrentInferenceParams({ ...DEFAULT_INFERENCE_PARAMS });
				setCurrentSystemPrompt('');
				lastFetchedParamsRef.current = JSON.stringify(DEFAULT_INFERENCE_PARAMS);
				return;
			}
			
			const newParamsStr = JSON.stringify(config.params || {});
			if (newParamsStr !== lastFetchedParamsRef.current) {
				setCurrentSystemPrompt(config.systemPrompt ?? '');
				setCurrentInferenceParams(config.params || {});
				lastFetchedParamsRef.current = newParamsStr;
			}
		}

		loadConfig();
	}, [threadId]);
}
