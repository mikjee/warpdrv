import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import { EPostActionType, EPostActionStatus, type IDownload, type IDownloadPostAction } from '@warpcore/shared';
import { validateBackend } from './backendValidator';
import { validateWhisperBackend } from './whisperBackendValidator';
import { locateBinary } from './binaryLocator';
import { getAllDownloads } from './downloadManager';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { emitDevicesUpdate } from '../routes/backends';
import type { IBackend, IWhisperBackend } from '@warpcore/shared';
import { EValidationStatus, EDownloadStatus } from '@warpcore/shared';
import crypto from 'crypto';
const BACKENDS_PREFIX = 'backends:';
const WHISPER_BACKENDS_PREFIX = 'whisperBackends:';
interface IGroupResolution {
	done: boolean;
	anyFailed: boolean;
}
async function isGroupResolved(groupKey: string, currentId: string): Promise<IGroupResolution> {
	const all = await getAllDownloads();
	const group = all.filter(d => d.groupKey === groupKey);
	if (group.length === 0) return { done: false, anyFailed: false };
	const siblings = group.filter(d => d.id !== currentId);
	const done = siblings.every(d =>
		d.status === EDownloadStatus.COMPLETED ||
		d.status === EDownloadStatus.FAILED ||
		d.status === EDownloadStatus.CANCELLED
	);
	const anyFailed = group.some(d =>
		d.status === EDownloadStatus.FAILED ||
		d.status === EDownloadStatus.CANCELLED
	);
	return { done, anyFailed };
}
type TPersistFn = (dl: IDownload) => Promise<void>;
type TEmitFn = (dl: IDownload) => void;
type TPostActionHandler = (dl: IDownload, payload: Record<string, unknown>) => Promise<void>;
async function extractArchive(dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const destDir = payload.destDir as string;
	const archivePath = dl.destPath;
	if (!destDir) throw 'extractArchive: destDir missing in payload';
	if (!fs.existsSync(archivePath)) throw `extractArchive: archive not found at ${archivePath}`;
	fs.mkdirSync(destDir, { recursive: true });
	const ext = path.extname(archivePath).toLowerCase();
	if (ext === '.zip') {
		const zip = new AdmZip(archivePath);
		zip.extractAllTo(destDir, true);
	} else if (archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz')) {
		await new Promise<void>((resolve, reject) => {
			const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir]);
			proc.on('error', reject);
			proc.on('exit', (code) => {
				if (code === 0) resolve();
				else reject(`tar exited with code ${code}`);
			});
		});
	} else {
		throw `extractArchive: unsupported archive type ${ext}`;
	}
}
async function locateBinaryAction(dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const rootDir = payload.rootDir as string;
	const binaryName = payload.binaryName as string;
	const contextKey = payload.contextKey as string;
	if (!rootDir) throw 'locateBinary: rootDir missing in payload';
	if (!binaryName) throw 'locateBinary: binaryName missing in payload';
	if (!contextKey) throw 'locateBinary: contextKey missing in payload';
	const found = locateBinary({ rootDir, binaryName });
	if (!found) throw `locateBinary: ${binaryName} not found under ${rootDir}`;
	if (!dl.postActions) return;
	for (let i = 0; i < dl.postActions.length; i++) {
		const action = dl.postActions[i];
		if (action.payload && typeof action.payload === 'object' && (action.payload as Record<string, unknown>)[contextKey] === '__LOCATED__') {
			(action.payload as Record<string, unknown>)[contextKey] = found;
		}
	}
}
async function chmodExecutable(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	if (!binaryPath) throw 'chmodExecutable: binaryPath missing in payload';
	if (os.platform() === 'win32') return;
	if (!fs.existsSync(binaryPath)) throw `chmodExecutable: binary not found at ${binaryPath}`;
	fs.chmodSync(binaryPath, 0o755);
}
async function registerLlamaBackend(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	const name = payload.name as string;
	const description = (payload.description as string) ?? '';
	const defaultArgs = (payload.defaultArgs as string[]) ?? [];
	if (!binaryPath) throw 'registerLlamaBackend: binaryPath missing in payload';
	if (!name) throw 'registerLlamaBackend: name missing in payload';
	if (!fs.existsSync(binaryPath)) throw `registerLlamaBackend: binary not found at ${binaryPath}`;
	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();
	const validation = await validateBackend(binaryPath, id);
	const backend: IBackend = {
		id,
		name,
		path: binaryPath,
		defaultArgs,
		description,
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		detectedDevices: validation.devices,
		createdAt: now,
		updatedAt: now,
	};
	await store.put(BACKENDS_PREFIX + id, backend);
	sseManager.emit('backends:update', backend);
	await emitDevicesUpdate();
}
async function registerWhisperBackend(_dl: IDownload, payload: Record<string, unknown>): Promise<void> {
	const binaryPath = payload.binaryPath as string;
	const name = payload.name as string;
	const description = (payload.description as string) ?? '';
	const defaultArgs = (payload.defaultArgs as string[]) ?? [];
	if (!binaryPath) throw 'registerWhisperBackend: binaryPath missing in payload';
	if (!name) throw 'registerWhisperBackend: name missing in payload';
	if (!fs.existsSync(binaryPath)) throw `registerWhisperBackend: binary not found at ${binaryPath}`;
	const id = crypto.randomBytes(6).toString('hex');
	const now = Date.now();
	const validation = await validateWhisperBackend(binaryPath);
	const backend: IWhisperBackend = {
		id,
		name,
		path: binaryPath,
		defaultArgs,
		description,
		validation: validation.valid ? EValidationStatus.VALID : EValidationStatus.INVALID,
		version: validation.version,
		createdAt: now,
		updatedAt: now,
	};
	await store.put(WHISPER_BACKENDS_PREFIX + id, backend);
	sseManager.emit('whisperBackends:update', backend);
}
async function rescanModels(_dl: IDownload, _payload: Record<string, unknown>): Promise<void> {
	throw 'rescanModels: not implemented';
}
const HANDLERS: Record<EPostActionType, TPostActionHandler> = {
	[EPostActionType.EXTRACT_ARCHIVE]: extractArchive,
	[EPostActionType.LOCATE_BINARY]: locateBinaryAction,
	[EPostActionType.CHMOD_EXECUTABLE]: chmodExecutable,
	[EPostActionType.REGISTER_LLAMA_BACKEND]: registerLlamaBackend,
	[EPostActionType.REGISTER_WHISPER_BACKEND]: registerWhisperBackend,
	[EPostActionType.RESCAN_MODELS]: rescanModels,
};
export async function runPostActions(dl: IDownload, persist: TPersistFn, emit: TEmitFn): Promise<void> {
	if (!dl.postActions || dl.postActions.length === 0) return;
	for (let i = 0; i < dl.postActions.length; i++) {
		const action: IDownloadPostAction = dl.postActions[i];
		const handler = HANDLERS[action.type];
		if (!handler) {
			action.status = EPostActionStatus.FAILED;
			action.error = `Unknown post-action type: ${action.type}`;
			await persist(dl);
			emit(dl);
			throw action.error;
		}
		action.status = EPostActionStatus.RUNNING;
		action.error = null;
		await persist(dl);
		emit(dl);
		try {
			await handler(dl, action.payload);
			action.status = EPostActionStatus.COMPLETED;
			await persist(dl);
			emit(dl);
		} catch (err) {
			action.status = EPostActionStatus.FAILED;
			action.error = String(err);
			await persist(dl);
			emit(dl);
			throw err;
		}
	}
}
