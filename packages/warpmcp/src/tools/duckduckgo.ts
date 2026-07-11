import { search, searchNews, searchImages, searchVideos, SafeSearchType, SearchTimeType } from 'duck-duck-scrape';

export { search, searchNews, searchImages, searchVideos };

export const DDG_HEADERS = {
	headers: {
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
	},
};

export function mapSafeSearch(value: string): SafeSearchType {
	switch (value) {
		case 'strict': return SafeSearchType.STRICT;
		case 'off': return SafeSearchType.OFF;
		default: return SafeSearchType.MODERATE;
	}
}

export function mapTimeRange(value: string): SearchTimeType | undefined {
	switch (value) {
		case 'day': return SearchTimeType.DAY;
		case 'week': return SearchTimeType.WEEK;
		case 'month': return SearchTimeType.MONTH;
		case 'year': return SearchTimeType.YEAR;
		default: return undefined;
	}
}
