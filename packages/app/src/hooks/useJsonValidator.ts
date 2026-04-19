import { useState, useCallback } from 'react';

export function useJsonValidator<T>(initialValue: string = '') {
	const [error, setError] = useState<string | null>(null);

	const validateAndParse = useCallback((jsonStr: string): { valid: boolean; parsed?: T; error?: string } => {
		try {
			if (!jsonStr.trim()) {
				return { valid: true, parsed: {} as T };
			}
			const parsed = JSON.parse(jsonStr);
			setError(null);
			return { valid: true, parsed };
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'Invalid JSON';
			setError(errorMsg);
			return { valid: false, error: errorMsg };
		}
	}, []);

	const clearError = useCallback(() => setError(null), []);

	return { error, validateAndParse, clearError };
}
