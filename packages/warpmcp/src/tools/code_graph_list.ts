import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphNode } from '@warpcore/shared';

export const codeGraphListDefinition = {
	name: 'code_graph_list',
	description: 'List all symbols in a specific file or directory. Useful for browsing a file structure. Path is relative to project_root. Use empty string for project root to list all top-level files.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'File path or directory (relative to project_root). Use empty string for project root.' },
		},
		required: ['path'],
	},
	resultLimit: 40960,
};

export async function codeGraphListHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; path: string },
): Promise<{ results: ICodeGraphNode[] }> {
	if (!deps.codeGraphListFile) throw new Error('codeGraphListFile not available');
	const results = await deps.codeGraphListFile(args.project_root, args.path);
	return { results };
}
