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
	IChatThread,
	IChatThreadCreatePayload,
	IChatMessage,
	IChatMessageCreatePayload,
	IThreadConfig,
	IChatPreset,
	IChatPresetCreatePayload,
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

export async function updateServer(id: string, data: Partial<Pick<IServer, 'backendId' | 'modelPath' | 'mmprojPath' | 'serverName' | 'params' | 'serverAlias' | 'autoLaunch'>>, relaunch = true) {
	return api.put<IServer>(`/servers/${id}`, { ...data, relaunch });
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

// ============================================================
// Proxy
// ============================================================

export interface IProxyStatus {
	enabled: boolean;
	port: number;
	running: boolean; // whether the proxy server instance is actually running
	healthy: boolean; // actual health from /health endpoint probe (only meaningful when running)
	error: string | null; // error message if proxy failed to start
}

export interface IStickyRouteInfo {
	alias: string;
	serverId: string;
	serverName: string | null;
}

export async function fetchProxyStatus() {
	return api.get<IProxyStatus>('/proxy/status');
}

export async function fetchStickyRoutes() {
	return api.getList<IStickyRouteInfo>('/proxy/routes');
}

export async function clearStickyRoute(alias: string) {
	return api.del<{ cleared: boolean }>(`/proxy/routes/${encodeURIComponent(alias)}`);
}

export async function clearAllStickyRoutes() {
	return api.del<null>('/proxy/routes');
}

export async function startProxy() {
	return api.post<null>('/proxy/start');
}

export async function stopProxy() {
	return api.post<null>('/proxy/stop');
}

export * from './hub-services';

// Chat
export async function fetchThreads() {
	return api.getList<IChatThread>('/chat/threads');
}
export async function createThread(data?: IChatThreadCreatePayload) {
	return api.post<IChatThread>('/chat/threads', data ?? {});
}
export async function fetchThread(id: string) {
	return api.get<IChatThread & { messages: IChatMessage[] }>(`/chat/threads/${id}`);
}
export async function updateThread(id: string, data: Partial<IChatThreadCreatePayload>) {
	return api.put<IChatThread>(`/chat/threads/${id}`, data);
}
export async function deleteThread(id: string) {
	return api.del<null>(`/chat/threads/${id}`);
}
export async function appendMessages(threadId: string, messages: IChatMessageCreatePayload[]) {
	return api.post<IChatMessage[]>(`/chat/threads/${threadId}/messages`, messages);
}

// Chat Presets
export async function fetchChatPresets() {
	return api.getList<IChatPreset>('/chat/presets');
}
export async function createChatPreset(data: IChatPresetCreatePayload) {
	return api.post<IChatPreset>('/chat/presets', data);
}
export async function updateChatPreset(id: string, data: Partial<IChatPresetCreatePayload>) {
	return api.put<IChatPreset>(`/chat/presets/${id}`, data);
}
export async function deleteChatPreset(id: string) {
	return api.del<null>(`/chat/presets/${id}`);
}

// Thread Config
export async function fetchThreadConfig(threadId: string) {
	return api.get<IThreadConfig>(`/chat/threads/${threadId}/config`);
}
export async function updateThreadConfig(threadId: string, data: { presetId?: string | null; systemPrompt?: string; params?: string }) {
	return api.put<IThreadConfig>(`/chat/threads/${threadId}/config`, data);
}
