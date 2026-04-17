import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import type { TThreadId } from '@warpcore/bridge';
import { DEFAULT_INFERENCE_PARAMS } from '@/components/ChatConfigSidebar';

export function useThreadConfig(threadId: TThreadId | null, flushPendingSaves?: () => void) {
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	useEffect(() => {
		if (!threadId) return;

		// Flush any pending edits from the previous thread before loading new config
		flushPendingSaves?.();

		async function loadConfig() {
			const res = await fetch(`/api/chat/threads/${threadId}/config`);
			
			if (!res.ok) {
				setCurrentInferenceParams({ ...DEFAULT_INFERENCE_PARAMS });
				setCurrentSystemPrompt('');
				return;
			}
			
			const data = await res.json();
			const config = data.data;
			
			if (!config) {
				setCurrentInferenceParams({ ...DEFAULT_INFERENCE_PARAMS });
				setCurrentSystemPrompt('');
				return;
			}
			
			// config.params is a JSON string from the API — parse it
			const parsedParams = config.params ? JSON.parse(config.params) : {};
			setCurrentSystemPrompt(config.systemPrompt ?? '');
			setCurrentInferenceParams(parsedParams);
		}

		loadConfig();
	}, [threadId, flushPendingSaves]);
}
