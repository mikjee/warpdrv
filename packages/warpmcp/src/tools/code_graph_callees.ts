import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphNode } from '@warpcore/shared';

export const codeGraphCalleesDefinition = {
	name: 'code_graph_callees',
	description: 'Find all symbols that the given symbol calls or references (forward dependencies). Shows what a function calls, what a class extends, etc. depth > 1 returns transitive dependencies, limited to resolved symbols only. Accepts either symbol_id (exact) or symbol (name). On ambiguous name, returns callees for all candidates.',
	inputSchema: {
		type: 'object',
		properties: {
			symbol_id: { type: 'string', description: 'Exact symbol descriptor (e.g. src/foo.ts#FooClass.bar)' },
			symbol: { type: 'string', description: 'Symbol name (may be ambiguous)' },
			depth: { type: 'number', default: 1, description: 'How many levels deep to traverse (1 = direct callees only). Limited to resolved symbols.' },
		},
		required: [],
	},
};

export async function codeGraphCalleesHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; symbol_id?: string; symbol?: string; depth?: number },
): Promise<{ results: ICodeGraphNode[] }> {
	if (!deps.codeGraphGetCallees || !deps.codeGraphSearch) {
		throw new Error('codeGraphGetCallees or codeGraphSearch not available');
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
		const callees = await deps.codeGraphGetCallees!(args.project_root, sym.id, depth);
		for (const c of callees) {
			if (!seen.has(c.id)) {
				seen.add(c.id);
				results.push(c);
			}
		}
	}

	return { results };
}
