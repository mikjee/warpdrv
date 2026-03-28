import { useState, useEffect, useCallback, useRef } from 'react';
import type { IApiResponse, IApiListResponse } from '@warpcore/shared';

interface IUseQueryOptions {
	// Poll interval in ms. 0 = no polling
	pollInterval?: number;
	// Skip initial fetch
	enabled?: boolean;
	deepCompare?: boolean;
}

interface IUseQueryResult<T> {
	data: T | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

// Single resource query
export function useQuery<T>(
	fetcher: () => Promise<IApiResponse<T>>,
	options?: IUseQueryOptions,
): IUseQueryResult<T> {
	const [data, setData] = useState<T | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const enabled = options?.enabled ?? true;

	const refetch = useCallback(async () => {
		if (!enabled) return;
		setLoading(prev => prev || data === null);
		const result = await fetcher();
		if (result.ok) {
			if (options?.deepCompare) {
				setData(prev => JSON.stringify(prev) === JSON.stringify(result.data) ? prev : result.data);
			} else {
				setData(result.data);
			}
			setError(null);
		} else {
			setError(result.error);
		}
		setLoading(false);
	}, [fetcher, enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch();

		if (options?.pollInterval && options.pollInterval > 0) {
			intervalRef.current = setInterval(refetch, options.pollInterval);
			return () => {
				if (intervalRef.current) clearInterval(intervalRef.current);
			};
		}
	}, [enabled, options?.pollInterval]);

	return { data, loading, error, refetch };
}

// List resource query
interface IUseListQueryResult<T> {
	data: T[];
	total: number;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function useListQuery<T>(
	fetcher: () => Promise<IApiListResponse<T>>,
	options?: IUseQueryOptions,
): IUseListQueryResult<T> {
	const [data, setData] = useState<T[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const lastJsonRef = useRef<string>('');
	const enabled = options?.enabled ?? true;

	const refetch = useCallback(async () => {
		if (!enabled) return;
		const result = await fetcher();
		if (result.ok) {
			const json = options?.deepCompare ? JSON.stringify(result.data) : '';
			if (options?.deepCompare && json === lastJsonRef.current) return;
			lastJsonRef.current = json;
			setData(result.data);
			setTotal(result.total);
			setError(null);
		} else {
			setError(result.error);
		}
		setLoading(false);
	}, [fetcher, enabled]);

	useEffect(() => {
		if (!enabled) return;
		refetch();
		if (options?.pollInterval && options.pollInterval > 0) {
			intervalRef.current = setInterval(refetch, options.pollInterval);
			return () => {
				if (intervalRef.current) clearInterval(intervalRef.current);
			};
		}
	}, [enabled, options?.pollInterval]);

	return { data, total, loading, error, refetch };
}

// Mutation helper (for POST/PUT/DELETE actions)
interface IUseMutationResult<TInput, TOutput> {
	mutate: (input: TInput) => Promise<TOutput | null>;
	loading: boolean;
	error: string | null;
}

export function useMutation<TInput, TOutput>(
	mutator: (input: TInput) => Promise<IApiResponse<TOutput>>,
): IUseMutationResult<TInput, TOutput> {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const mutate = useCallback(async (input: TInput): Promise<TOutput | null> => {
		setLoading(true);
		setError(null);
		const result = await mutator(input);
		setLoading(false);
		if (result.ok) return result.data;
		setError(result.error);
		return null;
	}, [mutator]);

	return { mutate, loading, error };
}
