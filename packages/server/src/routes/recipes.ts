import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import type {
	IRecipe,
	IRecipeCreatePayload,
	IRecipeUpdatePayload,
	IRecipeRunRequest,
	IRecipeRunResponse,
	IRecipeState,
} from '@warpcore/shared';
import { parseRecipe } from '@warpcore/shared';
import {
	listRecipes,
	getRecipe,
	putRecipe,
	deleteRecipe,
	getRecipeState,
	putRecipeState,
} from '../services/recipeStore';
import { startRun, cancelRun, getActiveRun, isRunInProgress } from '../services/recipeRunner';
import { sseManager } from '../services/sseManagerInstance';

export const recipesRouter = Router();

recipesRouter.get('/', async (_req: Request, res: Response) => {
	const recipes = await listRecipes();
	res.json({ ok: true, data: recipes, total: recipes.length, error: null });
});

recipesRouter.get('/runs/active', (_req: Request, res: Response) => {
	res.json({ ok: true, data: getActiveRun(), error: null });
});

recipesRouter.post('/runs/cancel', (_req: Request, res: Response) => {
	const cancelled = cancelRun();
	res.json({ ok: true, data: { cancelled }, error: null });
});

recipesRouter.get('/:id', async (req: Request, res: Response) => {
	const recipe = await getRecipe(req.params.id as string);
	if (recipe === null) { res.status(404).json({ ok: false, data: null, error: 'Recipe not found' }); return; }
	res.json({ ok: true, data: recipe, error: null });
});

recipesRouter.get('/:id/state', async (req: Request, res: Response) => {
	const state = await getRecipeState(req.params.id as string);
	res.json({ ok: true, data: state, error: null });
});

recipesRouter.post('/', async (req: Request, res: Response) => {
	const body = req.body as IRecipeCreatePayload;
	if (!body.name || typeof body.source !== 'string') { res.status(400).json({ ok: false, data: null, error: 'name and source are required' }); return; }
	try { parseRecipe(body.source); }
	catch (err) { res.status(400).json({ ok: false, data: null, error: `Invalid recipe: ${(err as Error).message}` }); return; }

	const now = Date.now();
	const recipe: IRecipe = {
		id: crypto.randomBytes(6).toString('hex'),
		name: body.name,
		description: body.description ?? '',
		source: body.source,
		isBuiltIn: false,
		createdAt: now,
		updatedAt: now,
	};
	await putRecipe(recipe);
	sseManager.emit('recipes:update', recipe);
	res.status(201).json({ ok: true, data: recipe, error: null });
});

recipesRouter.put('/:id', async (req: Request, res: Response) => {
	const existing = await getRecipe(req.params.id as string);
	if (existing === null) { res.status(404).json({ ok: false, data: null, error: 'Recipe not found' }); return; }
	if (existing.isBuiltIn) { res.status(403).json({ ok: false, data: null, error: 'Built-in recipes are read-only' }); return; }

	const body = req.body as IRecipeUpdatePayload;
	const nextSource = body.source !== undefined ? body.source : existing.source;
	try { parseRecipe(nextSource); }
	catch (err) { res.status(400).json({ ok: false, data: null, error: `Invalid recipe: ${(err as Error).message}` }); return; }

	const updated: IRecipe = {
		...existing,
		name: body.name !== undefined ? body.name : existing.name,
		description: body.description !== undefined ? body.description : existing.description,
		source: nextSource,
		updatedAt: Date.now(),
	};
	await putRecipe(updated);
	sseManager.emit('recipes:update', updated);
	res.json({ ok: true, data: updated, error: null });
});

recipesRouter.delete('/:id', async (req: Request, res: Response) => {
	const existing = await getRecipe(req.params.id as string);
	if (existing === null) { res.status(404).json({ ok: false, data: null, error: 'Recipe not found' }); return; }
	if (existing.isBuiltIn) { res.status(403).json({ ok: false, data: null, error: 'Built-in recipes are read-only' }); return; }
	await deleteRecipe(req.params.id as string);
	sseManager.emit('recipes:delete', existing);
	res.json({ ok: true, data: { deleted: true }, error: null });
});

recipesRouter.post('/:id/run', async (req: Request, res: Response) => {
	const recipe = await getRecipe(req.params.id as string);
	if (recipe === null) { res.status(404).json({ ok: false, data: null, error: 'Recipe not found' }); return; }
	if (isRunInProgress()) { res.status(409).json({ ok: false, data: null, error: 'A recipe run is already in progress' }); return; }

	const body = req.body as IRecipeRunRequest;
	const inputs = body.inputs ?? {};

	let parsed;
	try { parsed = parseRecipe(recipe.source); }
	catch (err) { res.status(400).json({ ok: false, data: null, error: `Invalid recipe: ${(err as Error).message}` }); return; }

	const state: IRecipeState = {
		recipeId: recipe.id,
		lastInputs: inputs,
		lastRunAt: Date.now(),
	};
	await putRecipeState(state);

	try {
		const runId = await startRun(recipe.id, parsed, inputs);
		const response: IRecipeRunResponse = { runId };
		res.json({ ok: true, data: response, error: null });
	}
	catch (err) {
		res.status(500).json({ ok: false, data: null, error: (err as Error).message });
	}
});
