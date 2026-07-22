import type { IWarpmcpDeps } from '../types';

export const codeGraphClearDefinition = {
	name: 'code_graph_clear',
	description: 'Clear the entire code graph index for the project. Deletes all indexed files, nodes, and edges from the database. The index will be rebuilt on next ingest or search call.',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
	resultLimit: 40960,
};

export async function codeGraphClearHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string },
): Promise<{ cleared: true }> {
	if (!deps.codeGraphClear) throw new Error('codeGraphClear not available');
	await deps.codeGraphClear(args.project_root);
	return { cleared: true };
}
