import type { AppState, ImmerSet, ImmerGet } from '../types';

interface TTSSlice {
	ttsActiveMessageId: string | null;
	ttsIsGenerating: 'button' | 'vad' | null;
	ttsIsSpeaking: boolean;
	ttsSpokenByMessage: Record<string, number>;
	ttsVadSentencesSent: number;
	ttsVadSentencesDone: number;
	ttsVadRequestId: number;
	ttsStart: (messageId: string, mode?: 'button' | 'vad') => void;
	ttsStop: () => void;
	ttsSetGenerating: (v: 'button' | 'vad' | null) => void;
	ttsSetSpeaking: (v: boolean) => void;
	ttsSetActiveMessageId: (messageId: string | null) => void;
	ttsSetSpokenIndex: (messageId: string, index: number) => void;
	ttsClearSpokenIndex: (messageId: string) => void;
	ttsVadIncSent: () => void;
	ttsVadIncDone: () => void;
	ttsVadReset: () => void;
	ttsVadNewRequestId: () => number;
	vadActive: boolean;
	setVadActive: (v: boolean) => void;
}

export const ttsSlice = (
	setState: ImmerSet<AppState>,
	getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	ttsActiveMessageId: null,
	ttsIsGenerating: null,
	ttsIsSpeaking: false,
	ttsSpokenByMessage: {},
	ttsVadSentencesSent: 0,
	ttsVadSentencesDone: 0,
	ttsVadRequestId: 0,
	vadActive: false,
	ttsStart: (messageId, mode = 'button') => {
		console.log('[Store] ttsStart: messageId=', messageId, 'mode=', mode);
		setState(draft => {
			draft.ttsActiveMessageId = messageId;
			draft.ttsIsGenerating = mode;
			draft.ttsIsSpeaking = false;
		});
	},
	ttsStop: () => {
		console.log('[Store] ttsStop: clearing all TTS state');
		setState(draft => {
			draft.ttsActiveMessageId = null;
			draft.ttsIsGenerating = null;
			draft.ttsIsSpeaking = false;
		});
	},
	ttsSetGenerating: (v) => {
		setState(draft => {
			if (draft.ttsIsGenerating === 'button' && v === null && !draft.ttsIsSpeaking) {
				draft.ttsActiveMessageId = null;
			}
			draft.ttsIsGenerating = v;
		});
	},
	ttsSetSpeaking: (v) => {
		setState(draft => {
			draft.ttsIsSpeaking = v;
			if (!v && !draft.ttsIsGenerating) {
				draft.ttsActiveMessageId = null;
			}
		});
	},
	ttsSetActiveMessageId: (messageId) => {
		setState(draft => {
			draft.ttsActiveMessageId = messageId;
		});
	},
	ttsSetSpokenIndex: (messageId, index) => {
		setState(draft => {
			draft.ttsSpokenByMessage[messageId] = index;
		});
	},
	ttsClearSpokenIndex: (messageId) => {
		setState(draft => {
			delete draft.ttsSpokenByMessage[messageId];
		});
	},
	ttsVadIncSent: () => {
		setState(draft => {
			draft.ttsVadSentencesSent += 1;
		});
	},
	ttsVadIncDone: () => {
		setState(draft => {
			draft.ttsVadSentencesDone += 1;
		});
	},
	ttsVadReset: () => {
		setState(draft => {
			draft.ttsVadSentencesSent = 0;
			draft.ttsVadSentencesDone = 0;
			draft.ttsVadRequestId = 0;
		});
	},
	ttsVadNewRequestId: () => {
		const id = Date.now();
		setState(draft => {
			draft.ttsVadRequestId = id;
		});
		return id;
	},
	setVadActive: (v) => {
		const old = getState().vadActive;
		console.log('[Store] vadActive:', old, '→', v);
		setState(draft => {
			draft.vadActive = v;
		});
	},
});
