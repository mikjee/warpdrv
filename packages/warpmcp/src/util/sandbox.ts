import fs from 'fs';
import path from 'path';
export async function assertPathAllowed(roots: string[], requestedPath: string): Promise<string> {
	if (roots.length === 0) {
		throw new Error('No allowed roots configured. Set fsAllowedRoots in settings.');
	}
	const absRequested = path.resolve(requestedPath);
	let realResolved: string;
	try {
		realResolved = fs.realpathSync(absRequested);
	} catch {
		realResolved = absRequested;
	}
	for (const root of roots) {
		const absRoot = path.resolve(root);
		let realRoot: string;
		try {
			realRoot = fs.realpathSync(absRoot);
		} catch {
			realRoot = absRoot;
		}
		const rel = path.relative(realRoot, realResolved);
		if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
			return realResolved;
		}
	}
	throw new Error(`Path not within any allowed root: ${requestedPath}`);
}
