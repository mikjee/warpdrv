import fs from 'fs/promises';
import path from 'path';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';
export const fileWriteDefinition = {
	name: 'file_write',
	description: 'Write content to a file, creating it if missing and overwriting if present. Path must be within fsAllowedRoots.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the file.' },
			content: { type: 'string', description: 'Content to write.' },
			encoding: { type: 'string', description: 'Encoding of the content (default utf8). Use "base64" for binary.', default: 'utf8' },
		},
		required: ['path', 'content'],
	},
	resultLimit: 100000,
};
export async function fileWriteHandler(deps: IWarpmcpDeps, args: { path: string; content: string; encoding?: string }): Promise<{ bytesWritten: number }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const encoding = (args.encoding ?? 'utf8') as BufferEncoding;
	await fs.mkdir(path.dirname(safePath), { recursive: true });
	await fs.writeFile(safePath, args.content, { encoding });
	await deps.onFileWritten?.(safePath);
	const stat = await fs.stat(safePath);
	return { bytesWritten: stat.size };
}
