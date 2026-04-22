import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { DEFAULT_INFERENCE_PARAMS } from '@/components/ChatConfigSidebar';
import { EReasoningEffort, IChatInferenceParams, IThreadConfig } from '@warpcore/shared';
import { fetchThreadConfig, updateThreadConfig } from '@/api';

export function useThreadConfig(selectedPresetId: string | null,) {
	const currentThreadId = useStore(s => s.currentThreadId);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams as unknown as IChatInferenceParams);

	// Actions
	const setCurrentSystemPrompt = useStore(s => s.setCurrentSystemPrompt);
	const setCurrentInferenceParams = useStore(s => s.setCurrentInferenceParams);

	// Debounced save
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const saveValuesRef = useRef<{
		currentThreadId: string,
		presetId: string | null,
		systemPrompt: string,
		params: string,
	} | null>(null);

	const flushChanges = useCallback(() => {
		const { currentThreadId, ...saveObj } = saveValuesRef.current!;
		updateThreadConfig(currentThreadId, saveObj);
	}, [updateThreadConfig]);

	const debounceChange = useCallback((newParams?: any, newPrompt?: any) => {
		if (!currentThreadId) return;
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

		saveValuesRef.current = {
			currentThreadId: currentThreadId!,
			presetId: selectedPresetId,
			systemPrompt: newPrompt !== undefined ? newPrompt : currentSystemPrompt,
			params: JSON.stringify(newParams || currentInferenceParams),
		};

		saveTimerRef.current = setTimeout(flushChanges, 400);
	}, [
		currentThreadId,
		selectedPresetId,
		currentSystemPrompt,
		currentInferenceParams,
		flushChanges,
	]);

	const handleParamsChange = useCallback((newParams: Partial<IChatInferenceParams>) => {
		setCurrentInferenceParams(newParams as unknown as Record<string, unknown>);
		debounceChange(newParams);
	}, [debounceChange]);

	const handleSystemPromptChange = useCallback((newPrompt: string) => {
		setCurrentSystemPrompt(newPrompt);
		debounceChange(undefined, newPrompt);
	}, [debounceChange]);

	const flushPendingSaves = useCallback(() => {
		if (!saveTimerRef.current) return;
		clearTimeout(saveTimerRef.current);
		saveTimerRef.current = null;
		flushChanges();
	}, [flushChanges]);

	const loadConfig = useCallback(async (threadId: string | null) => {
		const setDefaults = () => {
			setCurrentInferenceParams({
				reasoningEffort: EReasoningEffort.NONE, enableThinking: false
			 });
			setCurrentSystemPrompt('');
		};

		if (!threadId) {
			setDefaults();
			return;
		}

		const res = await fetchThreadConfig(threadId);
		if (!res.ok) {
			setDefaults();
			return;
		}

		const config = res.data;
		if (!config) setDefaults();
		else {
			const parsedParams = config.params ? JSON.parse(config.params) : {};
			setCurrentSystemPrompt(config.systemPrompt ?? '');
			setCurrentInferenceParams(parsedParams);
		}
	}, []);

	useEffect(() => {
		flushPendingSaves();
		loadConfig(currentThreadId);
	}, [currentThreadId, flushPendingSaves, loadConfig]);

	return {
		handleParamsChange,
		handleSystemPromptChange,
		currentThreadId,
		currentSystemPrompt,
		currentInferenceParams,
	}
}
