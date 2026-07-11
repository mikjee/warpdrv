import { searchNews, DDG_HEADERS } from './duckduckgo';
import { mapSafeSearch, mapTimeRange } from './duckduckgo';

export const webSearchNewsDefinition = {
	name: 'web_search_news',
	description: 'Search recent news via DuckDuckGo. Returns articles with source and date.',
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The search query' },
			maxResults: { type: 'number', default: 10, description: 'Maximum number of results to return (default: 10)' },
			safeSearch: { type: 'string', enum: ['strict', 'moderate', 'off'], default: 'moderate', description: 'Safe search filter' },
			timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Time range filter' },
			region: { type: 'string', description: 'Region code (e.g. "us-en")' },
		},
		required: ['query'],
	},
};

export async function webSearchNewsHandler(args: {
	query: string;
	maxResults?: number;
	safeSearch?: string;
	timeRange?: string;
	region?: string;
}): Promise<{ results: Array<{ title: string; url: string; snippet: string; source: string; date: string }> } | { error: string }> {
	try {
		const options: any = { safeSearch: mapSafeSearch(args.safeSearch ?? 'moderate') };
		const time = mapTimeRange(args.timeRange ?? '');
		if (time) options.time = time;
		if (args.region) options.locale = args.region;

		const results = await searchNews(args.query, options, DDG_HEADERS);
		if (results.noResults) return { error: 'No results returned' };

		const sliced = results.results.slice(0, args.maxResults ?? 10);
		return {
			results: sliced.map(r => ({
				title: r.title,
				url: r.url,
				snippet: r.excerpt,
				source: r.syndicate,
				date: r.relativeTime || new Date(r.date * 1000).toISOString(),
			})),
		};
	} catch (err) {
		return { error: 'Search failed', detail: String(err) };
	}
}
