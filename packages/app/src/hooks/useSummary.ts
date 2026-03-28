import { useQuery } from './useQuery';
import { fetchSummary } from '../api/summary-services';
import type { ISummaryData } from '../api/summary-services';

export function useSummary() {
	return useQuery<ISummaryData>(fetchSummary, { pollInterval: 3000, deepCompare: true });
}