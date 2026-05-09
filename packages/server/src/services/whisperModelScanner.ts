import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { IWhisperModel, IWhisperModelFile } from '@warpcore/shared';
import { buildWhisperModelFile } from './whisperModelParser';
import { store } from '../util/store';

const WHISPER_MODELS_CACHE_KEY = 'whisperModels:cache';

// Scan all configured model roots for whisper models
export async function scanAllWhisperModelRoots(roots: string[]): Promise<IWhisperModel[]> {
	let cachedModels: IWhisperModel[] = [];
	try {
		cachedModels = await store.get<IWhisperModel[]>(WHISPER_MODELS_CACHE_KEY) ?? [];
	} catch {
		// Ignore cache errors
	}

	const scanned: IWhisperModel[] = [];
	for (const root of roots) {
		const models = await scanDirRecursive(root, null);
		scanned.push(...models);
	}

	// Save cache
	try {
		await store.put(WHISPER_MODELS_CACHE_KEY, scanned);
	} catch {
		// Ignore cache save errors
	}

	return scanned;
}

async function scanDirRecursive(
	dirPath: string,
	userSegment: string | null,
): Promise<IWhisperModel[]> {
	let entries: import('fs').Dirent[];
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch {
		return [];
	}

	const ggufEntries = entries.filter(e => e.isFile() && e.name.endsWith('.gguf'));
	const binEntries = entries.filter(e => e.isFile() && e.name.endsWith('.bin'));
	const subDirs = entries.filter(e => e.isDirectory());

	const results: IWhisperModel[] = [];

	// Build whisper model files for this directory
	const whisperEntries = [...ggufEntries, ...binEntries];
	const dirFiles: IWhisperModelFile[] = [];

	for (const entry of whisperEntries) {
		const modelFile = await buildWhisperModelFile(dirPath, entry.name);
		if (modelFile) {
			// Only include if architecture is whisper (for GGUF) or is .bin
			if (modelFile.format === 'bin' || modelFile.metadata?.architecture === 'whisper') {
				dirFiles.push(modelFile);
			}
		}
	}

	if (dirFiles.length === 0) {
		// No whisper models in this dir, recurse into subdirs
		for (const subDir of subDirs) {
			const childPath = path.join(dirPath, subDir.name);
			const childUserSegment = userSegment ?? subDir.name;
			const childModels = await scanDirRecursive(childPath, childUserSegment);
			results.push(...childModels);
		}
		return results;
	}

	// Build IWhisperModel from files in this directory
	const primaryFile = dirFiles.find(f => f.format === 'gguf') || dirFiles[0] || null;
	const totalSizeMb = dirFiles.reduce((sum, f) => sum + f.sizeMb, 0);

	const id = crypto.createHash('md5').update(dirPath).digest('hex').slice(0, 12);

	const model: IWhisperModel = {
		id,
		user: userSegment ?? 'unknown',
		name: path.basename(dirPath),
		dirPath,
		files: dirFiles,
		primaryFile,
		totalSizeMb,
	};

	results.push(model);

	// Also recurse into subdirs
	for (const subDir of subDirs) {
		const childPath = path.join(dirPath, subDir.name);
		const childUserSegment = userSegment ?? subDir.name;
		const childModels = await scanDirRecursive(childPath, childUserSegment);
		results.push(...childModels);
	}

	return results;
}

// Get cached whisper models
export async function getCachedWhisperModels(): Promise<IWhisperModel[]> {
	try {
		return await store.get<IWhisperModel[]>(WHISPER_MODELS_CACHE_KEY) ?? [];
	} catch {
		return [];
	}
}
