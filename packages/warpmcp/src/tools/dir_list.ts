import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { minimatch } from 'minimatch';
import ignore from 'ignore';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';

export interface IDirEntry {
	name: string;
	path: string;
	type: 'file' | 'dir' | 'symlink' | 'other';
	size?: number;
}

export interface IDirListResult {
	path: string;
	entries: IDirEntry[];
	pattern: string | null;
	depth: number;
}

export const dirListDefinition = {
	name: 'dir_list',
	description: 'List directory contents with optional glob filtering and recursion. Path defaults to thread projectRoot.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path. Defaults to thread projectRoot.' },
			pattern: { type: 'string', description: 'Minimatch glob pattern (e.g. "*.ts", "src/**/*.test.*").' },
			depth: { type: 'integer', description: 'Recursion depth. 0 = current dir only, 1 = one level deep, etc. (default 0).' },
		},
		required: [],
	},
	resultLimit: 40960,
};

function loadGitignore(dirPath: string): string[] {
	const patterns: string[] = [];
	try {
		const raw = fsSync.readFileSync(path.join(dirPath, '.gitignore'), 'utf8');
		for (const line of raw.split('\n')) {
			const trimmed = line.trim();
			if (trimmed && !trimmed.startsWith('#')) {
				patterns.push(trimmed);
			}
		}
	} catch {
		// No .gitignore or unreadable
	}
	return patterns;
}

async function walk(
	deps: IWarpmcpDeps,
	dirPath: string,
	relPrefix: string,
	currentDepth: number,
	maxDepth: number,
	allPatterns: string[],
	pattern: string | null,
): Promise<IDirEntry[]> {
	const entries: IDirEntry[] = [];
	const items = await fs.readdir(dirPath, { withFileTypes: true });

	const dirPatterns = loadGitignore(dirPath);
	const cumulativePatterns = [...allPatterns, ...dirPatterns];
	const ig = ignore();
	cumulativePatterns.forEach(p => ig.add(p));

	for (const item of items) {
		if (item.name === '.gitignore') continue;

		const entryRel = relPrefix ? `${relPrefix}/${item.name}` : item.name;

		if (ig.test(entryRel)) continue;
		if (pattern && !minimatch(entryRel, pattern)) continue;

		let type: IDirEntry['type'] = 'other';
		if (item.isFile()) type = 'file';
		else if (item.isDirectory()) type = 'dir';
		else if (item.isSymbolicLink()) type = 'symlink';

		const subPath = path.join(dirPath, item.name);

		try {
			await assertPathAllowed(deps.getFsAllowedRoots(), subPath);
		} catch {
			continue;
		}

		let size: number | undefined;
		if (type === 'file') {
			try {
				const stat = await fs.stat(subPath);
				size = stat.size;
			} catch {}
		}

		if (type === 'dir' && currentDepth < maxDepth) {
			const childEntries = await walk(deps, subPath, entryRel, currentDepth + 1, maxDepth, cumulativePatterns, pattern);
			entries.push({ name: item.name, path: entryRel, type });
			entries.push(...childEntries);
		} else {
			entries.push({ name: item.name, path: entryRel, type, size });
		}
	}

	return entries;
}

export async function dirListHandler(
	deps: IWarpmcpDeps,
	args: { path?: string; pattern?: string; depth?: number; threadId?: string },
): Promise<IDirListResult> {
	let rootPath: string | undefined;

	if (args.path) {
		rootPath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	} else if (args.threadId && deps.getProjectRoot) {
		const projectRoot = await deps.getProjectRoot(args.threadId);
		if (projectRoot) {
			rootPath = await assertPathAllowed(deps.getFsAllowedRoots(), projectRoot);
		}
	}

	if (!rootPath) {
		throw new Error('No path provided. Pass path explicitly or set thread projectRoot.');
	}

	const depth = args.depth ?? 0;
	const pattern = args.pattern ?? null;

	const entries = await walk(deps, rootPath, '', 0, depth, [], pattern);

	return { path: rootPath, entries, pattern, depth };
}
