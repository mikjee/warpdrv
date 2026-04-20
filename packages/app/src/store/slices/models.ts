import type { TModelId, IModel } from '@warpcore/shared';
import type { AppState, ImmerSet, ImmerGet } from '../types';

interface ModelsSlice {
	models: Record<TModelId, IModel>;
}

export const modelsSlice = (_setState: ImmerSet<AppState>, _getState: ImmerGet<AppState>): Partial<AppState> => ({
	models: {},
});
