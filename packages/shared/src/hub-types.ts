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
	filename: string; // Full path including directory (e.g., "models/file.gguf" or "file.gguf")
	size: number;
	isGguf: boolean;
	quantType: string;
	isDownloaded: boolean;
	downloadedInRoot: string | null;
	shardIndex: number | null; // 1-based index for split files, null if not a shard
	shardTotal: number | null; // Total number of shards, null if not a shard
	parentModel: string | null; // Base model name for grouping (e.g., "model" from "model-00001-of-00002.gguf")
	isPrimary: boolean; // True if this is the first shard (or non-shard file) - used for display
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

// Resume state from node-downloader-helper
export interface IResumeState {
	downloaded: number;
	filePath: string;
	fileName: string;
	total: number;
}

// Active/historical download
export interface IDownload {
	id: TDownloadId;
	author: string;
	modelName: string;
	filename: string; // Primary file
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
	resumeState: IResumeState | null;
	fileParts: string[]; // All files in this download (for split models)
	partIndex: number; // Which part this download represents (0 for primary)
}

// Download request payload - supports single or multiple files (for split models)
export interface IDownloadRequestPayload {
	author: string;
	modelName: string;
	filename: string; // Primary file (first shard or single file)
	destRoot: string;
	fileParts?: string[]; // Additional parts for split models (includes primary file)
}
