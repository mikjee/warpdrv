import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphNode } from '@warpcore/shared';

export const codeGraphCallersDefinition = {
	name: 'code_graph_callers',
	description: 'Find all symbols that call or reference the given symbol (reverse dependencies). Supports cross-file resolution via import tracking. depth > 1 returns transitive dependencies, limited to resolved symbols only. Accepts either symbol_id (exact) or symbol (name). On ambiguous name, returns callers for all candidates.',
	inputSchema: {
		type: 'object',
		properties: {
			symbol_id: { type: 'string', description: 'Exact symbol descriptor (e.g. src/foo.ts#FooClass.bar)' },
			symbol: { type: 'string', description: 'Symbol name (may be ambiguous)' },
			depth: { type: 'number', default: 1, description: 'How many levels deep to traverse (1 = direct callers only). Limited to resolved symbols.' },
		},
		required: [],
	},
	resultLimit: 40960,
};

export async function codeGraphCallersHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; symbol_id?: string; symbol?: string; depth?: number },
): Promise<{ results: ICodeGraphNode[] }> {
	if (!deps.codeGraphGetCallers || !deps.codeGraphSearch) {
		throw new Error('codeGraphGetCallers or codeGraphSearch not available');
	}

	const depth = args.depth ?? 1;
	const results: ICodeGraphNode[] = [];
	const seen = new Set<string>();

	let symbols: ICodeGraphNode[] = [];
	if (args.symbol_id) {
		const node = await deps.codeGraphGetSymbol!(args.project_root, args.symbol_id);
		if (node) symbols = [node];
	} else if (args.symbol) {
		symbols = await deps.codeGraphSearch!(args.project_root, args.symbol, { limit: 50 });
	}

	for (const sym of symbols) {
		const callers = await deps.codeGraphGetCallers!(args.project_root, sym.symbol, depth);
		for (const c of callers) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				results.push(c);
			}
		}
	}

	return { results };
}
