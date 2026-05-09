// ============================================================
// Hub File Parser - Handles nested directories and split GGUF files
// ============================================================

import path from 'path';
import fs from 'fs';
import type { IHubFile } from '@warpcore/shared';

// Pattern for split GGUF files: model-00001-of-00002.gguf
const SHARD_REGEX = /-(\d{5})-of-(\d{5})\.gguf$/i;

// Pattern to extract quant type from filename
const QUANT_REGEX = /[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|NVFP\d+|F16|F32|BF16)/i;

interface IHubRawFile {
	path: string;
	type: string;
	size: number;
}

interface IHubRawDir {
	path: string;
	type: string;
}

/**
 * Extracts shard info from a filename
 * Returns { shardIndex, shardTotal, parentModel } or nulls if not a shard
 */
export function extractShardInfo(filename: string): {
	shardIndex: number | null;
	shardTotal: number | null;
	parentModel: string | null;
} {
	const match = filename.match(SHARD_REGEX);
	if (!match) {
		return { shardIndex: null, shardTotal: null, parentModel: null };
	}

	const shardIndex = parseInt(match[1]!, 10);
	const shardTotal = parseInt(match[2]!, 10);

	// Extract parent model name (everything before the shard suffix)
	// e.g., "Llama-3.2-1B-Instruct-00001-of-00002.gguf" -> "Llama-3.2-1B-Instruct"
	const parentModel = filename.replace(SHARD_REGEX, '');

	return { shardIndex, shardTotal, parentModel };
}

/**
 * Groups split GGUF files by their parent model within a single directory
 * Returns a map of parentModel -> array of files belonging to that model
 */
export function groupSplitFilesByModel(files: IHubFile[]): Map<string, IHubFile[]> {
	const groups = new Map<string, IHubFile[]>();

	for (const file of files) {
		if (!file.isGguf) continue;

		const { shardIndex, shardTotal, parentModel } = extractShardInfo(file.filename);

		let key: string;
		if (shardIndex !== null && parentModel) {
			// This is a shard - group by parent model
			key = parentModel;
		} else {
			// Not a shard - use the filename itself as the key (without .gguf extension)
			key = file.filename.replace(/\.gguf$/i, '');
		}

		if (!groups.has(key)) {
			groups.set(key, []);
		}
		groups.get(key)!.push(file);
	}

	return groups;
}

/**
 * Processes a list of GGUF files and adds shard info + parent model metadata
 * Also marks the primary file (first shard or non-shard) for display purposes
 */
export function processGgufFiles(files: IHubFile[]): IHubFile[] {
	// Group by parent model
	const groups = groupSplitFilesByModel(files);

	// Process each file
	const processed: IHubFile[] = [];

	for (const file of files) {
		if (!file.isGguf) {
			processed.push(file);
			continue;
		}

		const { shardIndex, shardTotal, parentModel } = extractShardInfo(file.filename);

		let isPrimary = true;
		if (shardIndex !== null && parentModel) {
			// For shards, only the first one is primary
			isPrimary = shardIndex === 1;
		}

		processed.push({
			...file,
			shardIndex,
			shardTotal,
			parentModel,
			isPrimary,
		});
	}

	return processed;
}

/**
 * Recursively fetches files from nested directories (up to one level deep)
 * Uses the HF API to get files from subdirectories
 */
export async function fetchFilesFromDirectories(
	modelId: string,
	dirs: IHubRawDir[],
	branch: string = 'main',
): Promise<IHubRawFile[]> {
	const allFiles: IHubRawFile[] = [];

	for (const dir of dirs) {
		const dirPath = dir.path;
		const dirUrl = `https://huggingface.co/api/models/${modelId}/tree/${branch}/${dirPath}`;

		try {
			const response = await fetch(dirUrl);
			if (response.ok) {
				const contents = await response.json() as (IHubRawFile | IHubRawDir)[];
				for (const item of contents) {
					if (item.type === 'file') {
						// HF API already returns full path when querying /tree/main/{dirPath}
						// file.path is already "MXFP4_MOE/file-00001-of-00003.gguf"
						const file = item as IHubRawFile;
						allFiles.push(file); // Don't prepend dirPath - path is already complete
					}
					// Don't recurse deeper than one level
				}
			}
		} catch {}
	}

	return allFiles;
}

/**
 * Fetches all GGUF files from a model repo, including those in nested directories (one level deep)
 */
export async function fetchAllGgufFiles(
	author: string,
	modelName: string,
	branch: string = 'main',
): Promise<IHubRawFile[]> {
	const modelId = `${author}/${modelName}`;
	const treeUrl = `https://huggingface.co/api/models/${modelId}/tree/${branch}`;

	try {
		const response = await fetch(treeUrl);
		if (!response.ok) return [];

		const contents = await response.json() as (IHubRawFile | IHubRawDir)[];

		// Separate files and directories
		const files: IHubRawFile[] = [];
		const dirs: IHubRawDir[] = [];

		for (const item of contents) {
			if (item.type === 'file' && (String(item.path).endsWith('.gguf') || String(item.path).endsWith('.bin'))) {
				files.push(item as IHubRawFile);
			} else if (item.type === 'directory') {
				dirs.push(item as IHubRawDir);
			}
		}

		// Fetch files from nested directories (one level deep)
		const nestedFiles = await fetchFilesFromDirectories(modelId, dirs, branch);

		return [...files, ...nestedFiles];
	} catch {
		return [];
	}
}

/**
 * Converts raw HF API file data to IHubFile format with all metadata
 */
export function mapFilesToHubFiles(
	files: IHubRawFile[],
	author: string,
	modelName: string,
	modelRoots: string[],
): IHubFile[] {
	return files.map((raw) => {
		const filename = String(raw.path ?? '');
		const size = Number(raw.size ?? 0);
		const isGguf = filename.endsWith('.gguf');
		const isWhisperBin = filename.endsWith('.bin');

		// Extract quant type from the basename
		const basename = path.basename(filename);
		const quantMatch = basename.match(QUANT_REGEX);
		const quantType = quantMatch ? quantMatch[1]!.toUpperCase() : '';

		// Check if downloaded in any model root
		let isDownloaded = false;
		let downloadedInRoot: string | null = null;

		for (const root of modelRoots) {
			const expectedPath = path.join(root, author, modelName, filename);
			if (fs.existsSync(expectedPath)) {
				isDownloaded = true;
				downloadedInRoot = root;
				break;
			}
		}

		return {
			filename,
			size,
			isGguf,
			isWhisperBin,
			quantType,
			isDownloaded,
			downloadedInRoot,
			shardIndex: null,
			shardTotal: null,
			parentModel: null,
			isPrimary: true,
		};
	});
}
