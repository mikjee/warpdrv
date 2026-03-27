import type { IApiResponse } from '@warpcore/shared';

export interface ISummaryData {
	servers: { running: number; errors: number };
	router: { online: boolean; hasError: boolean };
	devices: { unique: number };
}

const API_BASE = '/api';

export async function fetchSummary(): Promise<IApiResponse<ISummaryData>> {
	try {
		const res = await fetch(`${API_BASE}/summary`, {
			headers: { 'Content-Type': 'application/json' },
		});
		return await res.json();
	} catch (err) {
		return { ok: false, data: null as unknown as ISummaryData, error: String(err) };
	}
}