import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphNode } from '@warpcore/shared';

export const codeGraphSymbolDefinition = {
	name: 'code_graph_symbol',
	description: 'Get detailed information about a specific symbol including its type signature, location, and source code. Accepts either symbol_id (exact descriptor) or symbol (name). On ambiguous name resolution, returns all candidates. Never picks one.',
	inputSchema: {
		type: 'object',
		properties: {
			symbol_id: { type: 'string', description: 'Exact symbol descriptor (e.g. src/foo.ts#FooClass.bar)' },
			symbol: { type: 'string', description: 'Symbol name (may be ambiguous — returns all matches)' },
		},
		required: [],
	},
	resultLimit: 40960,
};

export async function codeGraphSymbolHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; symbol_id?: string; symbol?: string },
): Promise<{ result: ICodeGraphNode | ICodeGraphNode[] }> {
	if (!deps.codeGraphGetSymbol && !deps.codeGraphSearch) {
		throw new Error('codeGraphGetSymbol or codeGraphSearch not available');
	}

	if (args.symbol_id) {
		const result = await deps.codeGraphGetSymbol!(args.project_root, args.symbol_id);
		if (!result) return { result: null };
		return { result };
	}

	if (args.symbol) {
		const results = await deps.codeGraphSearch!(args.project_root, args.symbol, { limit: 50 });
		if (results.length === 1) return { result: results[0] };
		return { result: results };
	}

	throw new Error('Either symbol_id or symbol must be provided');
}
