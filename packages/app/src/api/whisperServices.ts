import { api } from './client';
import type {
	IWhisperBackend,
	IWhisperBackendCreatePayload,
	IWhisperBackendUpdatePayload,
	IWhisperServer,
	IWhisperServerCreatePayload,
} from '@warpcore/shared';

// ============================================================
// Whisper Backends
// ============================================================

export async function listWhisperBackends(): Promise<IWhisperBackend[]> {
	const res = await api.get<IWhisperBackend[]>('/whisper-backends');
	return res.data ?? [];
}

export async function createWhisperBackend(payload: IWhisperBackendCreatePayload): Promise<IWhisperBackend | null> {
	const res = await api.post<IWhisperBackend>('/whisper-backends', payload);
	return res.data ?? null;
}

export async function updateWhisperBackend(id: string, payload: IWhisperBackendUpdatePayload): Promise<IWhisperBackend | null> {
	const res = await api.put<IWhisperBackend>(`/whisper-backends/${id}`, payload);
	return res.data ?? null;
}

export async function removeWhisperBackend(id: string): Promise<void> {
	await api.delete(`/whisper-backends/${id}`);
}

export async function validateWhisperBackend(id: string): Promise<IWhisperBackend | null> {
	const res = await api.post<IWhisperBackend>(`/whisper-backends/${id}/validate`);
	return res.data ?? null;
}

// ============================================================
// Whisper Servers
// ============================================================

export async function listWhisperServers(): Promise<IWhisperServer[]> {
	const res = await api.get<IWhisperServer[]>('/whisper-servers');
	return res.data ?? [];
}

export async function createWhisperServer(payload: IWhisperServerCreatePayload): Promise<IWhisperServer | null> {
	const res = await api.post<IWhisperServer>('/whisper-servers', payload);
	return res.data ?? null;
}

export async function updateWhisperServer(id: string, payload: Partial<IWhisperServerCreatePayload> & { relaunch?: boolean }): Promise<IWhisperServer | null> {
	const res = await api.put<IWhisperServer>(`/whisper-servers/${id}`, payload);
	return res.data ?? null;
}

export async function removeWhisperServer(id: string): Promise<void> {
	await api.delete(`/whisper-servers/${id}`);
}

export async function stopWhisperServer(id: string): Promise<void> {
	await api.post(`/whisper-servers/${id}/stop`);
}

export async function restartWhisperServer(id: string): Promise<void> {
	await api.post(`/whisper-servers/${id}/restart`);
}

export async function stopAllWhisperServers(): Promise<void> {
	await api.post('/whisper-servers/stop-all');
}

export async function getWhisperServerLogs(id: string): Promise<string[]> {
	const res = await api.get<string[]>(`/whisper-servers/${id}/logs`);
	return res.data ?? [];
}

export async function clearWhisperServerLogs(id: string): Promise<void> {
	await api.delete(`/whisper-servers/${id}/logs`);
}

// ============================================================
// Whisper Models
// ============================================================

export interface IWhisperModelFile {
	fileName: string;
	filePath: string;
	sizeMb: number;
	format: 'gguf' | 'bin';
}

export interface IWhisperModel {
	id: string;
	user: string;
	name: string;
	dirPath: string;
	files: IWhisperModelFile[];
	primaryFile: IWhisperModelFile | null;
	totalSizeMb: number;
}

export async function listWhisperModels(): Promise<IWhisperModel[]> {
	const res = await api.get<IWhisperModel[]>('/whisper-models');
	return res.data ?? [];
}
