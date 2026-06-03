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
	console.log('[warpmcp] embeddingSearchHandler called, deps.embeddingSearch:', typeof deps.embeddingSearch);
	if (!deps.embeddingSearch) {
		console.log('[warpmcp] no function');
		throw "[warpmcp] embedding function not found"
	}
	console.log('[warpmcp] embeddingSearchHandler calling search with:', args.query, args.topK ?? 5);
	const results = await deps.embeddingSearch(args.query, args.topK ?? 5);
	console.log('[warpmcp] embeddingSearchHandler got', results.length, 'results');
	return { results };
}
