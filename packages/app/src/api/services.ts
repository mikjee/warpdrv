import { api, login, logout, fetchAuthCheck, fetchAuthMe } from './client';
import type {
	IRecipe,
	IRecipeCreatePayload,
	IRecipeUpdatePayload,
	IRecipeRunRequest,
	IRecipeRunResponse,
	IRecipeState,
	IRecipeRunState,
	ISettings,
	IBackend,
	IBackendCreatePayload,
	IBackendUpdatePayload,
	IBackendGroup,
	IBackendGroupCreatePayload,
	IBackendGroupUpdatePayload,
	IModel,
	IServer,
	IServerCreatePayload,
	IPreset,
	IPresetCreatePayload,
	IHubModel,
	IHubModelDetail,
	IDownload,
	IDownloadRequestPayload,
	IChatPreset,
	IChatPresetCreatePayload,
	IThreadConfig,
	IChatThreadCreatePayload,
	IChatMessageCreatePayload,
	IAccessTokenInfo,
	IAccessTokenCreatePayload,
	IAccessTokenUpdatePayload,
	IAccessTokenCreateResult,
	ICheckpoint,
	ISaveCheckpointRequest,
	ISaveCheckpointResponse,
	IRestoreCheckpointRequest,
	IRestoreCheckpointResponse,
	IRestoreCheckpointsMappedRequest,
	TCheckpointId,
} from '@warpcore/shared';
import type {
	IChatThread,
	IChatMessage,
	IFolder as IChatFolder,
} from '@warpcore/bridge';

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
// Backend Groups
// ============================================================

export async function fetchBackendGroups() {
	return api.getList<IBackendGroup>('/backend-groups');
}

export async function fetchBackendGroup(id: string) {
	return api.get<IBackendGroup>(`/backend-groups/${id}`);
}

export async function createBackendGroup(data: IBackendGroupCreatePayload) {
	return api.post<IBackendGroup>('/backend-groups', data);
}

export async function updateBackendGroup(id: string, data: IBackendGroupUpdatePayload) {
	return api.put<IBackendGroup>(`/backend-groups/${id}`, data);
}

export async function deleteBackendGroup(id: string) {
	return api.del<null>(`/backend-groups/${id}`);
}

export async function activateBackendInGroup(id: string, backendId: string) {
	return api.post<IBackendGroup>(`/backend-groups/${id}/activate/${backendId}`);
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

export async function updateModel(id: string, data: { recommendedInferenceParams?: string }) {
	return api.put<IModel>(`/models/${id}`, data);
}

export async function reparseModel(id: string) {
	return api.post<IModel>(`/models/${id}/reparse`);
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

export async function updateServer(id: string, data: Partial<Pick<IServer, 'backendId' | 'backendGroupId' | 'modelPath' | 'serverName' | 'params' | 'serverAlias' | 'autoLaunch' | 'useRecommendedInferenceParams' | 'autoSaveCheckpointOnStop' | 'autoLoadCheckpointOnStart' | 'useMultiModal'>>, relaunch = true) {
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
export async function fetchThreads(options?: { query?: string; folderId?: string | null }) {
	const queryString = new URLSearchParams({
		...(options?.query ? { query: options.query } : {}),
		...(options?.folderId !== undefined ? { folderId: String(options.folderId) } : {}),
	}).toString();
	return api.getList<IChatThread>(`/chat/threads?${queryString}`);
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
	return api.get<Omit<IThreadConfig, "params"> & { params: string }>(`/chat/threads/${threadId}/config`);
}
export async function updateThreadConfig(threadId: string, data: { presetId?: string | null; systemPrompt?: string; params?: string }) {
	return api.put<IThreadConfig>(`/chat/threads/${threadId}/config`, data);
}

// Folders
export async function fetchFolders() {
	return api.getList<IChatFolder>('/chat/folders');
}
export async function createFolder(name: string, parentId?: string | null) {
	return api.post<IChatFolder>('/chat/folders', { name, parentId: parentId ?? null });
}
export async function updateFolder(id: string, data: Partial<{ name: string; parentId: string | null; sortOrder: number }>) {
	return api.put<IChatFolder>(`/chat/folders/${id}`, data);
}
export async function deleteFolder(id: string) {
	return api.del<null>(`/chat/folders/${id}`);
}

// Message editing
export async function replaceMessageParts(messageId: string, parts: any[]) {
	return api.put<null>(`/chat/messages/${messageId}`, { parts });
}

export async function deleteMessage(messageId: string) {
	return api.del<null>(`/chat/messages/${messageId}`);
}

// Folder reordering
export async function reorderFolders(updates: Array<{ id: string; sortOrder: number }>) {
	return api.put<null>('/chat/folders/reorder', { updates });
}

// ============================================================
// Authentication
// ============================================================

export { login, logout, fetchAuthCheck, fetchAuthMe };

// ============================================================
// Access Tokens
// ============================================================

export async function fetchTokens() {
	return api.getList<IAccessTokenInfo>('/tokens');
}

export async function createToken(data: IAccessTokenCreatePayload) {
	return api.post<IAccessTokenCreateResult>('/tokens', data);
}

export async function updateToken(id: string, data: IAccessTokenUpdatePayload) {
	return api.put<IAccessTokenInfo>(`/tokens/${id}`, data);
}

export async function deleteToken(id: string) {
	return api.del<null>(`/tokens/${id}`);
}

// ============================================================
// Recipes
// ============================================================

export async function fetchRecipes() {
	return api.getList<IRecipe>('/recipes');
}

export async function fetchRecipe(id: string) {
	return api.get<IRecipe>(`/recipes/${id}`);
}

export async function fetchRecipeState(id: string) {
	return api.get<IRecipeState | null>(`/recipes/${id}/state`);
}

export async function createRecipe(data: IRecipeCreatePayload) {
	return api.post<IRecipe>('/recipes', data);
}

export async function updateRecipe(id: string, data: IRecipeUpdatePayload) {
	return api.put<IRecipe>(`/recipes/${id}`, data);
}

export async function deleteRecipe(id: string) {
	return api.del<null>(`/recipes/${id}`);
}

export async function runRecipe(id: string, data: IRecipeRunRequest) {
	return api.post<IRecipeRunResponse>(`/recipes/${id}/run`, data);
}

export async function cancelRecipeRun() {
	return api.post<{ cancelled: boolean }>('/recipes/runs/cancel');
}

export async function fetchActiveRecipeRun() {
	return api.get<IRecipeRunState | null>('/recipes/runs/active');
}
// ============================================================
// Checkpoints
// ============================================================
export async function fetchCheckpoints(serverId?: string) {
	const query = serverId ? `?serverId=${encodeURIComponent(serverId)}` : '';
	return api.getList<ICheckpoint>(`/checkpoints${query}`);
}
export async function saveCheckpoint(data: ISaveCheckpointRequest) {
	return api.post<ISaveCheckpointResponse>('/checkpoints', data);
}
export async function restoreCheckpoint(data: IRestoreCheckpointRequest) {
	return api.post<IRestoreCheckpointResponse>('/checkpoints/restore', data);
}
export async function restoreCheckpointsMapped(data: IRestoreCheckpointsMappedRequest) {
	return api.post<IRestoreCheckpointResponse>('/checkpoints/restore-mapped', data);
}
export async function updateCheckpoint(id: TCheckpointId, data: { name?: string; notes?: string | null }) {
	return api.put<ICheckpoint>(`/checkpoints/${id}`, data);
}
export async function deleteCheckpoint(id: TCheckpointId) {
	return api.del<{ id: TCheckpointId }>(`/checkpoints/${id}`);
}
