import fs from 'fs/promises';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';
export const fileReadDefinition = {
	name: 'file_read',
	description: 'Read the contents of a file. Path must be within fsAllowedRoots. Optionally read a range of lines using line_start and line_end (0-indexed, inclusive).',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the file.' },
			encoding: { type: 'string', description: 'Text encoding (default utf8). Use "base64" for binary.', default: 'utf8' },
			line_start: { type: 'integer', description: '0-indexed start line (inclusive). Ignored for base64 encoding.' },
			line_end: { type: 'integer', description: '0-indexed end line (inclusive). Omit to read to EOF. Ignored for base64 encoding.' },
		},
		required: ['path'],
	},
	resultLimit: 100000,
};
export async function fileReadHandler(deps: IWarpmcpDeps, args: { path: string; encoding?: string; line_start?: number; line_end?: number }): Promise<{ content: string; encoding: string }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const encoding = (args.encoding ?? 'utf8') as BufferEncoding;
	const content = await fs.readFile(safePath, { encoding });
	if (encoding !== 'base64' && args.line_start !== undefined) {
		const lines = content.split('\n');
		const sliced = lines.slice(args.line_start, args.line_end !== undefined ? args.line_end + 1 : undefined);
		return { content: sliced.join('\n'), encoding };
	}
	return { content, encoding };
}
