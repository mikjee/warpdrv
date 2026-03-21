// ============================================================
// Hub / HuggingFace Types
// ============================================================

export type TDownloadId = string;

export enum EDownloadStatus {
	DOWNLOADING = 'DOWNLOADING',
	PAUSED = 'PAUSED',
	COMPLETED = 'COMPLETED',
	FAILED = 'FAILED',
	CANCELLED = 'CANCELLED',
}

// Model from HF search results
export interface IHubModel {
	id: string; // "author/name"
	author: string;
	modelId: string;
	downloads: number;
	likes: number;
	lastModified: string;
	createdAt: string;
	tags: string[];
	pipelineTag: string;
}

// File within a HF model repo
export interface IHubFile {
	filename: string;
	size: number;
	isGguf: boolean;
	quantType: string;
	isDownloaded: boolean;
	downloadedInRoot: string | null;
}

// Full model detail
export interface IHubModelDetail {
	id: string;
	author: string;
	modelId: string;
	downloads: number;
	likes: number;
	lastModified: string;
	createdAt: string;
	tags: string[];
	pipelineTag: string;
	files: IHubFile[];
	readme: string;
}

// Active/historical download
export interface IDownload {
	id: TDownloadId;
	author: string;
	modelName: string;
	filename: string;
	quantType: string;
	destRoot: string;
	destPath: string;
	fileSizeBytes: number;
	downloadedBytes: number;
	status: EDownloadStatus;
	speedBps: number;
	progress: number; // 0-100
	error: string | null;
	startedAt: number;
	completedAt: number | null;
}

// Download request payload
export interface IDownloadRequestPayload {
	author: string;
	modelName: string;
	filename: string;
	destRoot: string;
}
