import type { AppState, ImmerSet, ImmerGet } from '../types';

interface TTSSlice {
	ttsActiveMessageId: string | null;
	ttsIsGenerating: 'button' | 'vad' | null;
	ttsIsSpeaking: boolean;
	ttsSpokenByMessage: Record<string, number>;
	ttsVadSentencesSent: number;
	ttsVadSentencesDone: number;
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
}

export const ttsSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	ttsActiveMessageId: null,
	ttsIsGenerating: null,
	ttsIsSpeaking: false,
	ttsSpokenByMessage: {},
	ttsVadSentencesSent: 0,
	ttsVadSentencesDone: 0,
	ttsStart: (messageId, mode = 'button') => {
		setState(draft => {
			draft.ttsActiveMessageId = messageId;
			draft.ttsIsGenerating = mode;
			draft.ttsIsSpeaking = false;
		});
	},
	ttsStop: () => {
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
		});
	},
});
