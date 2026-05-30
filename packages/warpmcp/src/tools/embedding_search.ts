import type { IWarpmcpDeps } from '../types';

export const embeddingSearchDefinition = {
	name: 'embedding_search',
	description: 'Search the embedding knowledge base for relevant messages. Use this to retrieve context about previous conversations.',
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The search query text' },
			topK: { type: 'number', default: 5, description: 'Number of results to return (default: 5)' },
		},
		required: ['query'],
	},
};

export interface IEmbeddingSearchResult {
	messageId: string;
	text: string;
	distance: number;
}

export async function embeddingSearchHandler(
	deps: IWarpmcpDeps,
	args: { query: string; topK?: number },
): Promise<{ results: IEmbeddingSearchResult[] }> {
	if (!deps.embeddingSearch) {
		return { results: [] };
	}
	const results = await deps.embeddingSearch(args.query, args.topK ?? 5);
	return { results };
}
