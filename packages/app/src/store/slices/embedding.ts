import type { AppState, ImmerSet, ImmerGet } from '../types';

interface EmbeddingSlice {
	selectedEmbeddingServerId: string | null;
	embeddingEnabled: boolean;
	setSelectedEmbeddingServerId: (id: string | null) => void;
	setEmbeddingEnabled: (v: boolean) => void;
}

export const embeddingSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	selectedEmbeddingServerId: null,
	embeddingEnabled: false,
	setSelectedEmbeddingServerId: (id) => {
		setState(draft => {
			draft.selectedEmbeddingServerId = id;
		});
	},
	setEmbeddingEnabled: (v) => {
		setState(draft => {
			draft.embeddingEnabled = v;
		});
	},
});
