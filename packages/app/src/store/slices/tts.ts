import type { AppState, ImmerSet, ImmerGet } from '../types';

interface TTSSlice {
	ttsActiveMessageId: string | null;
	ttsIsGenerating: boolean;
	ttsIsSpeaking: boolean;
	ttsStart: (messageId: string) => void;
	ttsStop: () => void;
	ttsSetGenerating: (v: boolean) => void;
	ttsSetSpeaking: (v: boolean) => void;
}

export const ttsSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	ttsActiveMessageId: null,
	ttsIsGenerating: false,
	ttsIsSpeaking: false,
	ttsStart: (messageId) => {
		setState(draft => {
			draft.ttsActiveMessageId = messageId;
			draft.ttsIsGenerating = true;
			draft.ttsIsSpeaking = false;
		});
	},
	ttsStop: () => {
		setState(draft => {
			draft.ttsActiveMessageId = null;
			draft.ttsIsGenerating = false;
			draft.ttsIsSpeaking = false;
		});
	},
	ttsSetGenerating: (v) => {
		setState(draft => {
			draft.ttsIsGenerating = v;
			if (!v && !draft.ttsIsSpeaking) {
				draft.ttsActiveMessageId = null;
			}
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
});
