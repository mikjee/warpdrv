import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphNode } from '@warpcore/shared';

export const codeGraphSearchDefinition = {
	name: 'code_graph_search',
	description: 'Search the code graph for symbols by name, kind, or signature. Supports fuzzy matching. Returns matching symbols with file locations. If the project is not yet indexed, it will be indexed automatically on first call.',
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'Search query — symbol name, regex pattern, or partial match' },
			kind: { type: 'string', description: 'Filter by symbol kind: function, class, interface, type, variable, method, enum, module, namespace, property, parameter, const, struct' },
			file_path: { type: 'string', description: 'Limit search to a specific file (relative to project_root)' },
			limit: { type: 'number', default: 20, description: 'Maximum number of results to return' },
		},
		required: ['query'],
	},
	resultLimit: 40960,
};

export async function codeGraphSearchHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; query: string; kind?: string; file_path?: string; limit?: number },
): Promise<{ results: ICodeGraphNode[] }> {
	if (!deps.codeGraphSearch) throw new Error('codeGraphSearch not available');
	const results = await deps.codeGraphSearch(args.project_root, args.query, {
		kind: args.kind,
		filePath: args.file_path,
		limit: args.limit ?? 20,
	});
	return { results };
}
