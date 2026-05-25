import fs from 'fs/promises';
import path from 'path';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';
export interface IDirEntry {
	name: string;
	type: 'file' | 'dir' | 'symlink' | 'other';
	size?: number;
}
export const dirListDefinition = {
	name: 'dir_list',
	description: 'List the contents of a directory. Path must be within fsAllowedRoots.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the directory.' },
		},
		required: ['path'],
	},
};
export async function dirListHandler(deps: IWarpmcpDeps, args: { path: string }): Promise<{ entries: IDirEntry[] }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const items = await fs.readdir(safePath, { withFileTypes: true });
	const entries: IDirEntry[] = [];
	for (const item of items) {
		let type: IDirEntry['type'] = 'other';
		if (item.isFile()) type = 'file';
		else if (item.isDirectory()) type = 'dir';
		else if (item.isSymbolicLink()) type = 'symlink';
		let size: number | undefined;
		if (type === 'file') {
			try {
				const stat = await fs.stat(path.join(safePath, item.name));
				size = stat.size;
			} catch {}
		}
		entries.push({ name: item.name, type, size });
	}
	return { entries };
}
