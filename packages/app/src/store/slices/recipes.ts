import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { TRecipeId, IRecipe, IRecipeRunState, TStepId } from '@warpcore/shared';

interface RecipesSlice {
	recipes: Record<TRecipeId, IRecipe>;
	activeRun: IRecipeRunState | null;
	stepOutputs: Record<TStepId, string>;
}

export const recipesSlice = (
	_setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	recipes: {},
	activeRun: null,
	stepOutputs: {},
});
