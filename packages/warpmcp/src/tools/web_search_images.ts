import { searchImages, DDG_HEADERS } from './duckduckgo';
import { mapSafeSearch } from './duckduckgo';

export const webSearchImagesDefinition = {
	name: 'web_search_images',
	description: 'Search images via DuckDuckGo. Returns image URLs with dimensions and source page.',
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The search query' },
			maxResults: { type: 'number', default: 10, description: 'Maximum number of results to return (default: 10)' },
			safeSearch: { type: 'string', enum: ['strict', 'moderate', 'off'], default: 'moderate', description: 'Safe search filter' },
		},
		required: ['query'],
	},
};

export async function webSearchImagesHandler(args: {
	query: string;
	maxResults?: number;
	safeSearch?: string;
}): Promise<{ results: Array<{ title: string; imageUrl: string; sourceUrl: string; thumbnail: string; width: number; height: number }> } | { error: string }> {
	try {
		const results = await searchImages(args.query, { safeSearch: mapSafeSearch(args.safeSearch ?? 'moderate') }, DDG_HEADERS);
		if (results.noResults) return { error: 'No results returned' };

		const sliced = results.results.slice(0, args.maxResults ?? 10);
		return {
			results: sliced.map(r => ({
				title: r.title,
				imageUrl: r.image,
				sourceUrl: r.url,
				thumbnail: r.thumbnail,
				width: r.width,
				height: r.height,
			})),
		};
	} catch (err) {
		return { error: 'Search failed', detail: String(err) };
	}
}
