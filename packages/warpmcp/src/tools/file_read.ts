import fs from 'fs/promises';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';
export const fileReadDefinition = {
	name: 'file_read',
	description: 'Read the contents of a file. Path must be within fsAllowedRoots.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the file.' },
			encoding: { type: 'string', description: 'Text encoding (default utf8). Use "base64" for binary.', default: 'utf8' },
		},
		required: ['path'],
	},
};
export async function fileReadHandler(deps: IWarpmcpDeps, args: { path: string; encoding?: string }): Promise<{ content: string; encoding: string }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const encoding = (args.encoding ?? 'utf8') as BufferEncoding;
	const content = await fs.readFile(safePath, { encoding });
	return { content, encoding };
}
