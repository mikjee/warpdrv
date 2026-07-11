import { spawn } from 'child_process';
import { rgPath } from '@vscode/ripgrep';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';

export interface IRgMatch {
	file: string;
	line: number;
	text: string;
}

export const rgDefinition = {
	name: 'rg',
	description: 'Search file contents using ripgrep. Fast regex search across files in a directory.',
	inputSchema: {
		type: 'object',
		properties: {
			pattern: { type: 'string', description: 'Regex pattern to search for.' },
			path: { type: 'string', description: 'Absolute path to the directory to search in. Defaults to thread projectRoot if not provided.' },
			type: { type: 'string', description: 'File type filter (e.g. ts, py, md, js, go, rust).' },
			caseSensitive: { type: 'boolean', default: false, description: 'Case-sensitive search (default: false).' },
			maxResults: { type: 'number', default: 200, description: 'Maximum number of matches to return (default: 200).' },
			contextLines: { type: 'number', default: 0, description: 'Lines of context before/after each match (default: 0).' },
		},
		required: ['pattern'],
	},
};

export async function rgHandler(
	deps: IWarpmcpDeps,
	args: { pattern: string; path?: string; type?: string; caseSensitive?: boolean; maxResults?: number; contextLines?: number },
): Promise<{ matches: IRgMatch[]; count: number; truncated: boolean }> {
	if (!args.path) {
		throw new Error('No path provided. Set projectRoot in thread config or pass path explicitly.');
	}
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const pattern = args.pattern;
	const type = args.type;
	const caseSensitive = args.caseSensitive ?? false;
	const maxResults = args.maxResults ?? 200;
	const contextLines = args.contextLines ?? 0;

	const rgArgs: string[] = ['--json', '--no-heading', '-e', pattern, '--'];

	if (type) rgArgs.push('-t', type);
	if (caseSensitive) rgArgs.push('--smart-case');
	if (contextLines > 0) rgArgs.push(`-C${contextLines}`);

	rgArgs.push(safePath);

	return await new Promise((resolve, reject) => {
		const child = spawn(rgPath, rgArgs);
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, 30000);

		child.stdout.on('data', (d) => { stdout += d.toString(); });
		child.stderr.on('data', (d) => { stderr += d.toString(); });
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				stderr += `\n[rg] Killed after 30000ms timeout.`;
			}
			if (code && code !== 1) {
				reject(new Error(`ripgrep exited with code ${code}.\n${stderr}`));
				return;
			}
			const matches = parseRgJson(stdout, maxResults);
			resolve({ matches, count: matches.length, truncated: matches.length > maxResults });
		});
	});
}

function parseRgJson(output: string, maxResults: number): IRgMatch[] {
	const matches: IRgMatch[] = [];
	const lines = output.split('\n');
	let currentFile: string | null = null;

	for (const line of lines) {
		if (!line.trim) continue;
		try {
			const event = JSON.parse(line);
			if (event.type === 'match') {
				const data = event.data;
				currentFile = data.data.path.text;
				for (const submatch of data.submatches) {
					const lineNum = data.line_number;
					const lineText = data.lines?.text ?? '';
					const matchStart = submatch.match?.start ?? 0;
					const matchEnd = submatch.match?.end ?? 0;
					matches.push({
						file: currentFile,
						line: lineNum,
						text: lineText,
					});
				}
			}
		} catch {
			// Skip non-JSON lines
		}
		if (matches.length >= maxResults) break;
	}

	return matches;
}
