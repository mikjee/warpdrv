import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { IModel, IGgufFile } from '@warpcore/shared';
import { parseGgufMetadata } from './ggufParser';

// Shard pattern: -00001-of-00003.gguf
const SHARD_REGEX = /-(\d{5})-of-(\d{5})\.gguf$/i;

// mmproj pattern
const MMPROJ_REGEX = /mmproj/i;

function makeModelId(dirPath: string): string {
	return crypto.createHash('md5').update(dirPath).digest('hex').slice(0, 12);
}

// Scan a single model directory (user/model level)
async function scanModelDir(dirPath: string, user: string, modelName: string): Promise<IModel | null> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		console.log(`[modelScanner] Scanning model dir: ${dirPath} (${entries.length} entries)`);
		const ggufEntries = entries.filter(e => e.isFile() && e.name.endsWith('.gguf'));

		if (ggufEntries.length === 0) return null;

		const files: IGgufFile[] = [];

		for (const entry of ggufEntries) {
			const filePath = path.join(dirPath, entry.name);
			const stat = await fs.stat(filePath);
			const sizeMb = Math.round(stat.size / (1024 * 1024));

			// Detect shard info
			const shardMatch = entry.name.match(SHARD_REGEX);
			const shardIndex = shardMatch ? parseInt(shardMatch[1]!, 10) : null;
			const shardTotal = shardMatch ? parseInt(shardMatch[2]!, 10) : null;

			// Detect mmproj
			const isMmproj = MMPROJ_REGEX.test(entry.name);

			// Parse metadata (only for first shard or non-shard files)
			const shouldParse = !isMmproj && (shardIndex === null || shardIndex === 1);
			const metadata = shouldParse ? await parseGgufMetadata(filePath) : null;

			files.push({
				fileName: entry.name,
				filePath,
				sizeMb,
				metadata,
				shardIndex,
				shardTotal,
				isMmproj,
			});
		}

		// Auto-detect primary model file
		// Priority: non-shard non-mmproj files first, then first shard of a multi-shard set
		const modelFiles = files.filter(f => !f.isMmproj);
		const nonShardFiles = modelFiles.filter(f => f.shardIndex === null);
		const firstShards = modelFiles.filter(f => f.shardIndex === 1);

		// Pick the largest non-shard model file, or first shard
		let primaryFile: IGgufFile | null = null;
		if (nonShardFiles.length > 0) {
			primaryFile = nonShardFiles.sort((a, b) => b.sizeMb - a.sizeMb)[0] ?? null;
		} else if (firstShards.length > 0) {
			primaryFile = firstShards[0] ?? null;
		}

		// Auto-detect mmproj
		const mmprojFile = files.find(f => f.isMmproj) ?? null;

		// Total size = sum of all shards belonging to the primary model
		let totalSizeMb = 0;
		if (primaryFile && primaryFile.shardTotal) {
			// Sum all shards
			totalSizeMb = modelFiles
				.filter(f => f.shardIndex !== null)
				.reduce((sum, f) => sum + f.sizeMb, 0);
		} else if (primaryFile) {
			totalSizeMb = primaryFile.sizeMb;
		}

		return {
			id: makeModelId(dirPath),
			user,
			name: modelName,
			dirPath,
			files,
			primaryFile,
			mmprojFile,
			totalSizeMb,
		};
	} catch {
		return null;
	}
}

// Scan a root model directory following user/model folder structure
export async function scanModelRoot(rootPath: string): Promise<IModel[]> {
	const models: IModel[] = [];

	try {
		console.log(`[modelScanner] Scanning root: ${rootPath}`);
		const userDirs = await fs.readdir(rootPath, { withFileTypes: true });
		console.log(`[modelScanner] Found ${userDirs.length} user dirs`);

		for (const userDir of userDirs) {
			if (!userDir.isDirectory()) continue;
			const userPath = path.join(rootPath, userDir.name);

			const modelDirs = await fs.readdir(userPath, { withFileTypes: true });
			console.log(`[modelScanner] User ${userDir.name} has ${modelDirs.length} model dirs`);

			for (const modelDir of modelDirs) {
				if (!modelDir.isDirectory()) continue;
				const modelPath = path.join(userPath, modelDir.name);

				const model = await scanModelDir(modelPath, userDir.name, modelDir.name);
				if (model) {
					console.log(`[modelScanner] Found model: ${userDir.name}/${modelDir.name}`);
					models.push(model);
				}
			}
		}
	} catch (err) {
		console.error(`[modelScanner] Error scanning root ${rootPath}:`, err);
	}

	return models;
}

// Scan all configured model roots
export async function scanAllModelRoots(roots: string[]): Promise<IModel[]> {
	const all: IModel[] = [];
	for (const root of roots) {
		const models = await scanModelRoot(root);
		all.push(...models);
	}
	return all;
}
