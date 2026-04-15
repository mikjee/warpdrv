import { store } from '../util/store';
import type { IRecipe, IRecipeState, TRecipeId } from '@warpcore/shared';

const RECIPE_PREFIX = 'recipe:';
const RECIPE_STATE_PREFIX = 'recipeState:';

function recipeKey(id: TRecipeId): string { return `${RECIPE_PREFIX}${id}`; }
function recipeStateKey(id: TRecipeId): string { return `${RECIPE_STATE_PREFIX}${id}`; }

export async function listRecipes(): Promise<IRecipe[]> {
	return store.list<IRecipe>(RECIPE_PREFIX);
}

export async function getRecipe(id: TRecipeId): Promise<IRecipe | null> {
	return store.get<IRecipe>(recipeKey(id));
}

export async function putRecipe(recipe: IRecipe): Promise<void> {
	await store.put<IRecipe>(recipeKey(recipe.id), recipe);
}

export async function deleteRecipe(id: TRecipeId): Promise<void> {
	await store.del(recipeKey(id));
	await store.del(recipeStateKey(id));
}

export async function getRecipeState(id: TRecipeId): Promise<IRecipeState | null> {
	return store.get<IRecipeState>(recipeStateKey(id));
}

export async function putRecipeState(state: IRecipeState): Promise<void> {
	await store.put<IRecipeState>(recipeStateKey(state.recipeId), state);
}
