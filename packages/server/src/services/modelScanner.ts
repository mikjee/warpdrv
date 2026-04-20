import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { IModel, IGgufFile } from '@warpcore/shared';
import { parseGgufMetadata } from './ggufParser';
import { store } from '../util/store';

const MODELS_CACHE_KEY = 'models:cache';

// Shard pattern: -00001-of-00003.gguf
const SHARD_REGEX = /-(\d{5})-of-(\d{5})\.gguf$/i;

// mmproj pattern
const MMPROJ_REGEX = /mmproj/i;

function makeModelId(dirPath: string, parentModel: string | null = null): string {
	const idString = parentModel ? `${dirPath}:${parentModel}` : dirPath;
	return crypto.createHash('md5').update(idString).digest('hex').slice(0, 12);
}

// Scan a single model directory (user/model level) with caching - original version for potential rollback
async function scanModelDir(dirPath: string, user: string, modelName: string, cachedModels: IModel[]): Promise<IModel | null> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		const ggufEntries = entries.filter(e => e.isFile() && e.name.endsWith('.gguf'));

		if (ggufEntries.length === 0) return null;

		// Find cached model for this directory
		const modelId = makeModelId(dirPath);
		const cachedModel = cachedModels.find(m => m.id === modelId);
		const cachedFilesByPath = new Map(cachedModel?.files.map(f => [f.filePath, f]) ?? []);

		const files: IGgufFile[] = [];
		let parsedCount = 0;
		let cachedCount = 0;

		for (const entry of ggufEntries) {
			const filePath = path.join(dirPath, entry.name);
			const stat = await fs.stat(filePath);
			const sizeMb = Math.round(stat.size / (1024 * 1024));

			// Detect shard info and parentModel
			const shardMatch = entry.name.match(SHARD_REGEX);
			const shardIndex = shardMatch ? parseInt(shardMatch[1]!, 10) : null;
			const shardTotal = shardMatch ? parseInt(shardMatch[2]!, 10) : null;
			const parentModel = shardMatch ? entry.name.replace(SHARD_REGEX, '') : null;

			// Detect mmproj
			const isMmproj = MMPROJ_REGEX.test(entry.name);

			// Try to reuse cached metadata
			const cachedFile = cachedFilesByPath.get(filePath);
			let metadata = cachedFile?.metadata ?? null;

			// Parse metadata if not cached or if it's a new file
			const shouldParse = !isMmproj && (shardIndex === null || shardIndex === 1);
			if (shouldParse && !metadata) {
				metadata = await parseGgufMetadata(filePath);
				parsedCount++;
			} else if (cachedFile) {
				cachedCount++;
			}

			files.push({
				fileName: entry.name,
				filePath,
				sizeMb,
				metadata,
				shardIndex,
				shardTotal,
				isMmproj,
				parentModel,
			});
		}

		// Auto-detect primary model file
		const modelFiles = files.filter(f => !f.isMmproj);
		const nonShardFiles = modelFiles.filter(f => f.shardIndex === null);
		const firstShards = modelFiles.filter(f => f.shardIndex === 1);

		let primaryFile: IGgufFile | null = null;
		if (nonShardFiles.length > 0) {
			primaryFile = nonShardFiles.sort((a, b) => b.sizeMb - a.sizeMb)[0] ?? null;
		} else if (firstShards.length > 0) {
			primaryFile = firstShards[0] ?? null;
		}

		// Auto-detect mmproj
		const mmprojFile = files.find(f => f.isMmproj) ?? null;

		// Total size = sum of all shards
		let totalSizeMb = 0;
		if (primaryFile && primaryFile.shardTotal) {
			totalSizeMb = modelFiles.filter(f => f.shardIndex !== null).reduce((sum, f) => sum + f.sizeMb, 0);
		} else if (primaryFile) {
			totalSizeMb = primaryFile.sizeMb;
		}

		const result: IModel = {
			id: modelId,
			user,
			name: modelName,
			dirPath,
			files,
			primaryFile,
			mmprojFile,
			totalSizeMb,
		};

		return result;
	} catch {
		return null;
	}
}

// Scan a single model directory and group files by parentModel
// Returns multiple models if directory contains multiple quant variants
async function scanModelDirGroupedByParentModel(
	dirPath: string,
	user: string,
	cachedModels: IModel[]
): Promise<IModel[]> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		const ggufEntries = entries.filter(e => e.isFile() && e.name.endsWith('.gguf'));

		if (ggufEntries.length === 0) return [];

		// Find cached model for this directory
		const cachedModel = cachedModels.find(m => m.dirPath === dirPath);
		const cachedFilesByPath = new Map(cachedModel?.files.map(f => [f.filePath, f]) ?? []);
		const cachedRecommendedParams = cachedModel?.recommendedInferenceParams ?? undefined;

		const files: IGgufFile[] = [];
		let parsedCount = 0;
		let cachedCount = 0;

		for (const entry of ggufEntries) {
			const filePath = path.join(dirPath, entry.name);
			const stat = await fs.stat(filePath);
			const sizeMb = Math.round(stat.size / (1024 * 1024));

			// Detect shard info and parentModel
			const shardMatch = entry.name.match(SHARD_REGEX);
			const shardIndex = shardMatch ? parseInt(shardMatch[1]!, 10) : null;
			const shardTotal = shardMatch ? parseInt(shardMatch[2]!, 10) : null;
			const parentModel = shardMatch ? entry.name.replace(SHARD_REGEX, '') : null;

			// Detect mmproj
			const isMmproj = MMPROJ_REGEX.test(entry.name);

			// Try to reuse cached metadata
			const cachedFile = cachedFilesByPath.get(filePath);
			let metadata = cachedFile?.metadata ?? null;

			// Parse metadata if not cached or if it's a new file
			const shouldParse = !isMmproj && (shardIndex === null || shardIndex === 1);
			if (shouldParse && !metadata) {
				metadata = await parseGgufMetadata(filePath);
				parsedCount++;
			} else if (cachedFile) {
				cachedCount++;
			}

			files.push({
				fileName: entry.name,
				filePath,
				sizeMb,
				metadata,
				shardIndex,
				shardTotal,
				isMmproj,
				parentModel,
			});
		}

		// Group files by parentModel
		const modelGroups = new Map<string, IGgufFile[]>();
		for (const file of files) {
			if (!file.isMmproj) {
				const key = file.parentModel || file.fileName.replace(/\.gguf$/i, '');
				if (!modelGroups.has(key)) {
					modelGroups.set(key, []);
				}
				modelGroups.get(key)!.push(file);
			}
		}

		// Add mmproj files to ALL model groups (mmproj is quantization-agnostic)
		for (const file of files) {
			if (file.isMmproj) {
				for (const key of modelGroups.keys()) {
					modelGroups.get(key)!.push(file);
				}
			}
		}

		// Create model for each group
		const models: IModel[] = [];
		for (const [parentModel, groupFiles] of modelGroups) {
			const modelFiles = groupFiles.filter(f => !f.isMmproj);
			const nonShardFiles = modelFiles.filter(f => f.shardIndex === null);
			const firstShards = modelFiles.filter(f => f.shardIndex === 1);

			let primaryFile: IGgufFile | null = null;
			if (nonShardFiles.length > 0) {
				primaryFile = nonShardFiles.sort((a, b) => b.sizeMb - a.sizeMb)[0] ?? null;
			} else if (firstShards.length > 0) {
				primaryFile = firstShards[0] ?? null;
			}

			const mmprojFile = groupFiles.find(f => f.isMmproj) ?? null;

			// Total size = sum of shards in the same parentModel group
			let totalSizeMb = 0;
			if (primaryFile && primaryFile.shardTotal) {
				totalSizeMb = modelFiles.filter(f => f.shardIndex !== null).reduce((sum, f) => sum + f.sizeMb, 0);
			} else if (primaryFile) {
				totalSizeMb = primaryFile.sizeMb;
			}

			const model: IModel = {
				id: crypto.createHash('md5').update(`${dirPath}:${parentModel}`).digest('hex').slice(0, 12),
				user,
				name: parentModel,
				dirPath,
				files: groupFiles,
				primaryFile,
				mmprojFile,
				totalSizeMb,
				recommendedInferenceParams: cachedRecommendedParams,
			};
			models.push(model);
		}

		return models;
	} catch {
		return [];
	}
}

// Scan a root model directory following user/model folder structure
async function scanModelRoot(rootPath: string, cachedModels: IModel[]): Promise<IModel[]> {
	const models: IModel[] = [];

	try {
		const userDirs = await fs.readdir(rootPath, { withFileTypes: true });

		for (const userDir of userDirs) {
			if (!userDir.isDirectory()) continue;
			const userPath = path.join(rootPath, userDir.name);

			const modelDirs = await fs.readdir(userPath, { withFileTypes: true });

			for (const modelDir of modelDirs) {
				if (!modelDir.isDirectory()) continue;
				const modelPath = path.join(userPath, modelDir.name);

				// Use new function with parentModel grouping
				const modelGroup = await scanModelDirGroupedByParentModel(modelPath, userDir.name, cachedModels);
				models.push(...modelGroup); // Flatten
			}
		}
	} catch (err) {
		console.error(`[modelScanner] Error scanning root ${rootPath}:`, err);
	}

	return models;
}

// Scan all configured model roots with caching
export async function scanAllModelRoots(roots: string[]): Promise<IModel[]> {
	// Load cached models
	let cachedModels: IModel[] = [];
	try {
		cachedModels = await store.get<IModel[]>(MODELS_CACHE_KEY) ?? [];
		} catch (err) {
		console.warn('[modelScanner] Failed to load cache:', err);
	}

	const beforeCount = cachedModels.length;

	// Scan all roots
	const scanned: IModel[] = [];
	for (const root of roots) {
		const models = await scanModelRoot(root, cachedModels);
		scanned.push(...models);
	}

	// Build set of scanned model IDs
	const scannedIds = new Set(scanned.map(m => m.id));

	// Remove models that are no longer accessible (not in scanned results)
	const removed = cachedModels.filter(m => !scannedIds.has(m.id)).length;

	// Save updated cache
	try {
		await store.put(MODELS_CACHE_KEY, scanned);
		const msg = `[modelScanner] Saved cache: ${scanned.length} models`;
		if (removed > 0) console.log(`${msg} (removed ${removed} from removed directories)`);
		else if (scanned.length !== beforeCount) console.log(`${msg} (${scanned.length - beforeCount} changed)`);
		else console.log(msg);
	} catch (err) {
		console.warn('[modelScanner] Failed to save cache:', err);
	}

	return scanned;
}
