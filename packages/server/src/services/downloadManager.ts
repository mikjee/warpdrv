import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DownloaderHelper } from 'node-downloader-helper';
import { EDownloadStatus, type IDownload, type TDownloadId, type IResumeState } from '@warpcore/shared';
import { store } from '../util/store';

const DOWNLOADS_PREFIX = 'downloads:';

// In-memory map of active downloader instances
const activeDownloaders = new Map<TDownloadId, DownloaderHelper>();

// In-memory download state (synced to store for history)
const downloadState = new Map<TDownloadId, IDownload>();

function makeDownloadId(): TDownloadId {
	return crypto.randomBytes(8).toString('hex');
}

function quantFromFilename(filename: string): string {
	const match = filename.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|F16|F32|BF16)/i);
	return match ? match[1]!.toUpperCase() : '';
}

function hfDownloadUrl(author: string, modelName: string, filename: string): string {
	return `https://huggingface.co/${author}/${modelName}/resolve/main/${filename}`;
}

async function persistDownload(dl: IDownload): Promise<void> {
	downloadState.set(dl.id, dl);
	await store.put(DOWNLOADS_PREFIX + dl.id, dl);
}

export async function startDownload(
	author: string,
	modelName: string,
	filename: string,
	destRoot: string,
	fileParts: string[] = [],
	partIndex: number = 0,
): Promise<IDownload> {
	const id = makeDownloadId();

	// Handle nested directories - create full path including subdirectories
	const fileDirname = path.dirname(filename);
	const destDir = fileDirname && fileDirname !== '.'
		? path.join(destRoot, author, modelName, fileDirname)
		: path.join(destRoot, author, modelName);
	const destPath = path.join(destRoot, author, modelName, filename);
	const url = hfDownloadUrl(author, modelName, filename);

	// Create directory structure (including any nested dirs from the file path)
	fs.mkdirSync(destDir, { recursive: true });

	// If fileParts not provided, use just the filename
	const allParts = fileParts.length > 0 ? fileParts : [filename];

	console.log('[DownloadManager] Starting download:', {
		id,
		filename,
		fileDirname,
		url,
		destDir,
		destPath,
		fileName: path.basename(filename),
		allParts,
		partIndex,
	});

	const dl: IDownload = {
		id,
		author,
		modelName,
		filename,
		quantType: quantFromFilename(filename),
		destRoot,
		destPath,
		fileSizeBytes: 0,
		downloadedBytes: 0,
		status: EDownloadStatus.DOWNLOADING,
		speedBps: 0,
		progress: 0,
		error: null,
		startedAt: Date.now(),
		completedAt: null,
		resumeState: null,
		fileParts: allParts,
		partIndex,
	};

	const helper = new DownloaderHelper(url, destDir, {
		fileName: path.basename(filename), // Only use basename for the actual file name
		override: false,
		removeOnStop: false, // Keep partial file when paused
		removeOnFail: false, // Keep partial file on failure
		resumeIfFileExists: true,
		resumeOnIncomplete: true,
		resumeOnIncompleteMaxRetry: 3,
	});

	helper.on('start', () => {
		dl.status = EDownloadStatus.DOWNLOADING;
		persistDownload(dl);
	});

	helper.on('progress', (stats) => {
		dl.fileSizeBytes = stats.total ?? 0;
		dl.downloadedBytes = stats.downloaded;
		dl.progress = stats.progress;
		dl.speedBps = stats.speed;
		dl.status = EDownloadStatus.DOWNLOADING;
		// Don't persist on every progress tick — too many writes
		downloadState.set(dl.id, dl);
	});

	helper.on('end', () => {
		dl.status = EDownloadStatus.COMPLETED;
		dl.progress = 100;
		dl.completedAt = Date.now();
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	helper.on('error', (err) => {
		dl.status = EDownloadStatus.FAILED;
		const errorMsg = err.message ?? String(err);
		console.error(`[Download Error] ID: ${id}, URL: ${url}, Filename: ${filename}, DestDir: ${destDir}, Error: ${errorMsg}`);
		dl.error = errorMsg;
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	helper.on('stop', () => {
		dl.status = EDownloadStatus.PAUSED;
		dl.speedBps = 0;
		// Capture resume state before discarding the helper
		const resumeState = helper.getResumeState();
		dl.resumeState = {
			downloaded: resumeState.downloaded,
			filePath: resumeState.filePath,
			fileName: resumeState.fileName,
			total: resumeState.total,
		} as IResumeState;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	activeDownloaders.set(id, helper);
	await persistDownload(dl);

	console.log(`[Download Start] ID: ${id}, URL: ${url}, Filename: ${filename}, DestDir: ${destDir}, DestPath: ${destPath}`);

	helper.start().catch((err) => {
		dl.status = EDownloadStatus.FAILED;
		dl.error = String(err);
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	return dl;
}

/**
 * Starts downloads for all parts of a split model simultaneously
 * Returns an array of download IDs that were started
 */
export async function startMultiPartDownload(
	author: string,
	modelName: string,
	fileParts: string[],
	destRoot: string,
): Promise<string[]> {
	const downloadIds: string[] = [];

	// Start all parts in parallel
	const downloadPromises = fileParts.map((filename, index) =>
		startDownload(author, modelName, filename, destRoot, fileParts, index).then((dl) => {
			downloadIds.push(dl.id);
			return dl;
		}),
	);

	await Promise.all(downloadPromises);
	return downloadIds;
}

export async function pauseDownload(id: TDownloadId): Promise<boolean> {
	const helper = activeDownloaders.get(id);
	if (!helper) return false;
	helper.stop();
	return true;
}

export async function resumeDownload(id: TDownloadId): Promise<boolean> {
	const dl = downloadState.get(id) ?? await store.get<IDownload>(DOWNLOADS_PREFIX + id);
	if (!dl || dl.status !== EDownloadStatus.PAUSED) return false;

	const url = hfDownloadUrl(dl.author, dl.modelName, dl.filename);
	const destDir = path.dirname(dl.destPath);

	// Check if we have saved resume state and the partial file exists
	const hasResumeState = dl.resumeState !== null && fs.existsSync(dl.resumeState.filePath);
	const partialPath = dl.resumeState?.filePath ?? (dl.destPath + '.download');
	const hasPartialFile = fs.existsSync(partialPath);
	const partialSize = hasPartialFile ? fs.statSync(partialPath).size : 0;

	// Start fresh if no valid resume state or partial file is missing/empty
	const startFresh = !hasResumeState || !hasPartialFile || partialSize === 0;

	const helper = new DownloaderHelper(url, destDir, {
		fileName: path.basename(dl.filename), // Only use basename since destDir already has subdirs
		override: startFresh,
		removeOnStop: false,
		removeOnFail: false,
	});

	helper.on('progress', (stats) => {
		dl.fileSizeBytes = stats.total ?? 0;
		dl.downloadedBytes = stats.downloaded;
		dl.progress = stats.progress;
		dl.speedBps = stats.speed;
		dl.status = EDownloadStatus.DOWNLOADING;
		downloadState.set(dl.id, dl);
	});

	helper.on('end', () => {
		dl.status = EDownloadStatus.COMPLETED;
		dl.progress = 100;
		dl.completedAt = Date.now();
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	helper.on('error', (err) => {
		dl.status = EDownloadStatus.FAILED;
		dl.error = err.message ?? String(err);
		dl.speedBps = 0;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	helper.on('stop', () => {
		dl.status = EDownloadStatus.PAUSED;
		dl.speedBps = 0;
		// Capture resume state
		const resumeState = helper.getResumeState();
		dl.resumeState = {
			downloaded: resumeState.downloaded,
			filePath: resumeState.filePath,
			fileName: resumeState.fileName,
			total: resumeState.total,
		} as IResumeState;
		activeDownloaders.delete(id);
		persistDownload(dl);
	});

	activeDownloaders.set(id, helper);
	dl.status = EDownloadStatus.DOWNLOADING;

	// Reset progress if starting fresh
	if (startFresh) {
		dl.downloadedBytes = 0;
		dl.progress = 0;
		dl.resumeState = null;
		helper.start().catch((err) => {
			dl.status = EDownloadStatus.FAILED;
			dl.error = String(err);
			activeDownloaders.delete(id);
			persistDownload(dl);
		});
	} else {
		// Use resumeFromFile with saved state
		helper.resumeFromFile(partialPath, {
			total: dl.fileSizeBytes,
			fileName: dl.filename,
		}).catch((err) => {
			dl.status = EDownloadStatus.FAILED;
			dl.error = String(err);
			activeDownloaders.delete(id);
			persistDownload(dl);
		});
	}

	await persistDownload(dl);
	return true;
}

export async function cancelDownload(id: TDownloadId): Promise<boolean> {
	const helper = activeDownloaders.get(id);
	if (helper) helper.stop();
	activeDownloaders.delete(id);

	const dl = downloadState.get(id) ?? await store.get<IDownload>(DOWNLOADS_PREFIX + id);
	if (!dl) return false;

	dl.status = EDownloadStatus.CANCELLED;
	dl.speedBps = 0;
	dl.completedAt = Date.now();
	await persistDownload(dl);

	// Clean up partial file - use resumeState.filePath if available, otherwise fallback to default
	const partial = dl.resumeState?.filePath ?? (dl.destPath + '.download');
	try { fs.unlinkSync(partial); } catch {}

	return true;
}

export async function getAllDownloads(): Promise<IDownload[]> {
	// Merge in-memory state (has latest progress) with persisted history
	const persisted = await store.list<IDownload>(DOWNLOADS_PREFIX);
	const merged = new Map<string, IDownload>();

	for (const dl of persisted) merged.set(dl.id, dl);
	for (const [id, dl] of downloadState) merged.set(id, dl);

	return [...merged.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export async function clearDownloadHistory(): Promise<void> {
	const all = await store.list<IDownload>(DOWNLOADS_PREFIX);
	for (const dl of all) {
		if (dl.status !== EDownloadStatus.DOWNLOADING && dl.status !== EDownloadStatus.PAUSED) {
			await store.del(DOWNLOADS_PREFIX + dl.id);
			downloadState.delete(dl.id);
		}
	}
}
