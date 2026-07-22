import type { IWarpmcpDeps } from '../types';
import type { ICodeGraphIngestResult } from '@warpcore/shared';

export const codeGraphIngestDefinition = {
	name: 'code_graph_ingest',
	description: 'Parse and index all source files in the project root using tree-sitter. Builds a searchable graph of symbols, types, and their cross-file references. Runs incrementally — only files that changed since last index are re-parsed based on content hash.',
	inputSchema: {
		type: 'object',
		properties: {
			force: { type: 'boolean', default: false, description: 'Force full re-index, ignoring file modification times and content hashes' },
		},
		required: [],
	},
	resultLimit: 40960,
};

export async function codeGraphIngestHandler(
	deps: IWarpmcpDeps,
	args: { project_root: string; force?: boolean },
): Promise<ICodeGraphIngestResult> {
	if (!deps.codeGraphIngest) throw new Error('codeGraphIngest not available');
	return await deps.codeGraphIngest(args.project_root, args.force ?? false);
}
