import fs from 'fs/promises';
import path from 'path';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';
export const filePatchDefinition = {
	name: 'file_patch',
	description: 'Replace an exact text segment in a file. oldText must be non-empty and appear exactly once. Path must be within fsAllowedRoots.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the file.' },
			oldText: { type: 'string', description: 'Exact text to find (non-empty, must appear exactly once). Include indentation.' },
			newText: { type: 'string', description: 'Replacement text.' },
			encoding: { type: 'string', description: 'Text encoding (default utf8).', default: 'utf8' },
		},
		required: ['path', 'oldText', 'newText'],
	},
};
export async function filePatchHandler(deps: IWarpmcpDeps, args: { path: string; oldText: string; newText: string; encoding?: string }): Promise<{ success: boolean; fileSize: number }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const encoding = (args.encoding ?? 'utf8') as BufferEncoding;
	if (!args.oldText) {
		throw new Error('oldText must be non-empty');
	}
	if (args.oldText === args.newText) {
		throw new Error('oldText and newText are identical, nothing to patch');
	}
	const content = await fs.readFile(safePath, { encoding });
	const first = content.indexOf(args.oldText);
	if (first === -1) {
		throw new Error('oldText not found in content');
	}
	const second = content.indexOf(args.oldText, first + 1);
	if (second !== -1) {
		throw new Error('Found multiple matches for oldText. Provide more surrounding context to make it unique.');
	}
	const newContent = content.substring(0, first) + args.newText + content.substring(first + args.oldText.length);
	await fs.writeFile(safePath, newContent, { encoding });
	await deps.onFileWritten?.(safePath);
	const stat = await fs.stat(safePath);
	return { success: true, fileSize: stat.size };
}
