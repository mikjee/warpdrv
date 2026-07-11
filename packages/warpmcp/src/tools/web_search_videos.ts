import { searchVideos, DDG_HEADERS } from './duckduckgo';
import { mapSafeSearch, mapTimeRange } from './duckduckgo';

export const webSearchVideosDefinition = {
	name: 'web_search_videos',
	description: 'Search videos via DuckDuckGo. Returns videos with duration and publish info.',
	inputSchema: {
		type: 'object',
		properties: {
			query: { type: 'string', description: 'The search query' },
			maxResults: { type: 'number', default: 10, description: 'Maximum number of results to return (default: 10)' },
			safeSearch: { type: 'string', enum: ['strict', 'moderate', 'off'], default: 'moderate', description: 'Safe search filter' },
			timeRange: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Time range filter' },
		},
		required: ['query'],
	},
};

export async function webSearchVideosHandler(args: {
	query: string;
	maxResults?: number;
	safeSearch?: string;
	timeRange?: string;
}): Promise<{ results: Array<{ title: string; url: string; description: string; duration: string; publishedOn: string; published: string }> } | { error: string }> {
	try {
		const options: any = { safeSearch: mapSafeSearch(args.safeSearch ?? 'moderate') };
		const time = mapTimeRange(args.timeRange ?? '');
		if (time) options.time = time;

		const results = await searchVideos(args.query, options, DDG_HEADERS);
		if (results.noResults) return { error: 'No results returned' };

		const sliced = results.results.slice(0, args.maxResults ?? 10);
		return {
			results: sliced.map(r => ({
				title: r.title,
				url: r.url,
				description: r.description,
				duration: r.duration,
				publishedOn: r.publishedOn,
				published: r.published,
			})),
		};
	} catch (err) {
		return { error: 'Search failed', detail: String(err) };
	}
}
