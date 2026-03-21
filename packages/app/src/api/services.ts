import { api } from './client';
import type {
	ISettings,
	IBackend,
	IBackendCreatePayload,
	IBackendUpdatePayload,
	IModel,
	IServer,
	IServerCreatePayload,
	IPreset,
	IPresetCreatePayload,
	IHubModel,
	IHubModelDetail,
	IDownload,
	IDownloadRequestPayload,
} from '@warpcore/shared';

// ============================================================
// Settings
// ============================================================

export async function fetchSettings() {
	return api.get<ISettings>('/settings');
}

export async function updateSettings(data: Partial<ISettings>) {
	return api.put<ISettings>('/settings', data);
}

// ============================================================
// Backends
// ============================================================

export async function fetchBackends() {
	return api.getList<IBackend>('/backends');
}

export async function fetchBackend(id: string) {
	return api.get<IBackend>(`/backends/${id}`);
}

export async function createBackend(data: IBackendCreatePayload) {
	return api.post<IBackend>('/backends', data);
}

export async function updateBackend(id: string, data: IBackendUpdatePayload) {
	return api.put<IBackend>(`/backends/${id}`, data);
}

export async function deleteBackend(id: string) {
	return api.del<null>(`/backends/${id}`);
}

export async function validateBackend(id: string) {
	return api.post<IBackend>(`/backends/${id}/validate`);
}

// ============================================================
// Models
// ============================================================

export async function fetchModels() {
	return api.getList<IModel>('/models');
}

export async function scanModels() {
	return api.post<IModel[]>('/models/scan');
}

export async function fetchScanStatus() {
	return api.get<{ modelCount: number; lastScanAt: number }>('/models/scan-status');
}

// ============================================================
// Servers
// ============================================================

export async function fetchServers() {
	return api.getList<IServer>('/servers');
}

export async function fetchServer(id: string) {
	return api.get<IServer>(`/servers/${id}`);
}

export async function launchServer(data: IServerCreatePayload) {
	return api.post<IServer>('/servers', data);
}

export async function stopServer(id: string) {
	return api.post<IServer>(`/servers/${id}/stop`);
}

export async function restartServer(id: string) {
	return api.post<IServer>(`/servers/${id}/restart`);
}

export async function updateServer(id: string, data: Partial<Pick<IServer, 'backendId' | 'modelPath' | 'mmprojPath' | 'params'>>) {
	return api.put<IServer>(`/servers/${id}`, data);
}

export async function removeServer(id: string) {
	return api.del<null>(`/servers/${id}`);
}

export async function fetchServerLogs(id: string) {
	return api.getList<string>(`/servers/${id}/logs`);
}

export async function clearServerLogs(id: string) {
	return api.del<null>(`/servers/${id}/logs`);
}

// ============================================================
// Presets
// ============================================================

export async function fetchPresets() {
	return api.getList<IPreset>('/presets');
}

export async function createPreset(data: IPresetCreatePayload) {
	return api.post<IPreset>('/presets', data);
}

export async function deletePreset(id: string) {
	return api.del<null>(`/presets/${id}`);
}

export * from './hub-services';
