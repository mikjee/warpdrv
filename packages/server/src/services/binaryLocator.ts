import fs from 'fs';
import path from 'path';
export interface IBinaryLocateOptions {
	rootDir: string;
	binaryName: string;
	maxDepth?: number;
}
function walk(dir: string, depth: number, maxDepth: number, target: string): string | null {
	if (depth > maxDepth) return null;
	let entries: string[] = [];
	try {
		entries = fs.readdirSync(dir);
	} catch {
		return null;
	}
	for (const entry of entries) {
		const full = path.join(dir, entry);
		let stat: fs.Stats;
		try {
			stat = fs.statSync(full);
		} catch {
			continue;
		}
		if (stat.isFile() && entry === target) return full;
		if (stat.isDirectory()) {
			const found = walk(full, depth + 1, maxDepth, target);
			if (found) return found;
		}
	}
	return null;
}
export function locateBinary(opts: IBinaryLocateOptions): string | null {
	const maxDepth = opts.maxDepth ?? 5;
	return walk(opts.rootDir, 0, maxDepth, opts.binaryName);
}
