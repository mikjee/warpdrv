import type { IApiResponse, IApiListResponse } from '@warpcore/shared';

const API_BASE = '/api';

async function request<T>(
	path: string,
	options?: RequestInit,
): Promise<IApiResponse<T>> {
	try {
		const res = await fetch(`${API_BASE}${path}`, {
			headers: { 'Content-Type': 'application/json' },
			...options,
		});
		const json = await res.json();
		return json as IApiResponse<T>;
	} catch (err) {
		return { ok: false, data: null as T, error: String(err) };
	}
}

async function requestList<T>(
	path: string,
	options?: RequestInit,
): Promise<IApiListResponse<T>> {
	try {
		const res = await fetch(`${API_BASE}${path}`, {
			headers: { 'Content-Type': 'application/json' },
			...options,
		});
		const json = await res.json();
		return json as IApiListResponse<T>;
	} catch (err) {
		return { ok: false, data: [], total: 0, error: String(err) };
	}
}

export const api = {
	get: <T>(path: string) => request<T>(path),
	getList: <T>(path: string) => requestList<T>(path),
	post: <T>(path: string, body?: unknown) =>
		request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
	put: <T>(path: string, body: unknown) =>
		request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
	del: <T>(path: string) =>
		request<T>(path, { method: 'DELETE' }),
};
