import type { IApiResponse, IApiListResponse } from '@warpcore/shared';

const API_BASE = '/api';

async function request<T>(
	path: string,
	options?: RequestInit,
): Promise<IApiResponse<T>> {
	try {
		const res = await fetch(`${API_BASE}${path}`, {
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			...options,
		});
		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			throw new Error(`HTTP ${res.status}: ${json.error ?? res.statusText}`);
		}
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
			credentials: 'include',
			...options,
		});
		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			throw new Error(`HTTP ${res.status}: ${json.error ?? res.statusText}`);
		}
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

// Auth-specific functions that handle Bearer tokens
export async function login(token: string): Promise<IApiResponse<unknown>> {
	try {
		const res = await fetch(`${API_BASE}/auth/login`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			credentials: 'include',
		});
		if (!res.ok) {
			const json = await res.json().catch(() => ({}));
			return { ok: false, data: null, error: json.error ?? res.statusText };
		}
		const json = await res.json();
		return json as IApiResponse<unknown>;
	} catch (err) {
		return { ok: false, data: null, error: String(err) };
	}
}

export async function logout(): Promise<IApiResponse<null>> {
	return api.post<null>('/auth/logout');
}

export async function fetchAuthCheck(): Promise<IApiResponse<unknown>> {
	try {
		return await api.get<unknown>('/auth/check');
	} catch (err) {
		if (String(err).includes('HTTP 401')) {
			return { ok: true, data: null, error: null };
		}
		return { ok: false, data: null, error: String(err) };
	}
}

export async function fetchAuthMe(): Promise<IApiResponse<unknown>> {
	return api.get<unknown>('/auth/me');
}

