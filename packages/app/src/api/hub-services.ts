import { api } from './client';
import type {
	IHubModel, IHubModelDetail, IDownload, IDownloadRequestPayload, IChatInferenceParams,
} from '@warpcore/shared';

export async function searchHub(q: string, sortField: string, sortOrder: string, paramsMin: number, paramsMax: number) {
	const params = new URLSearchParams({ q, sort: sortField, order: sortOrder });
	if (paramsMin > 0) params.set('params_min', String(paramsMin));
	if (paramsMax > 0) params.set('params_max', String(paramsMax));
	return api.getList<IHubModel>(`/hub/search?${params}`);
}

export async function fetchHubModel(author: string, name: string) {
	return api.get<IHubModelDetail>(`/hub/model/${author}/${name}`);
}

export async function startHubDownload(payload: IDownloadRequestPayload) {
	// Response can be either a single download or multiple downloads for split files
	return api.post<IDownload | { downloadIds: string[]; fileParts: string[] }>('/hub/download', payload);
}

export async function fetchDownloads() {
	return api.getList<IDownload>('/hub/downloads');
}

export async function pauseHubDownload(id: string) {
	return api.post<null>(`/hub/downloads/${id}/pause`);
}

export async function resumeHubDownload(id: string) {
	return api.post<null>(`/hub/downloads/${id}/resume`);
}

export async function cancelHubDownload(id: string) {
	return api.post<null>(`/hub/downloads/${id}/cancel`);
}

export async function clearDownloadHistory() {
	return api.del<null>('/hub/downloads/history');
}

export async function fetchRecommendedParams(author: string, name: string) {
	return api.get<Partial<IChatInferenceParams> | null>(`/hub/model/${author}/${name}/recommended-params`);
}
