import fs from 'fs/promises';
import path from 'path';
import { assertPathAllowed } from '../util/sandbox';
import type { IWarpmcpDeps } from '../types';

export const filePatchDefinition = {
	name: 'file_patch',
	description: 'Replace a text segment in a file. oldText must be non-empty and resolve to exactly one location. Whitespace and indentation are matched leniently, but the text content must be unique. Path must be within fsAllowedRoots.',
	inputSchema: {
		type: 'object',
		properties: {
			path: { type: 'string', description: 'Absolute path to the file.' },
			oldText: { type: 'string', description: 'Text to find. Must resolve to exactly one location. Copy it verbatim from the file including indentation; minor whitespace differences are tolerated.' },
			newText: { type: 'string', description: 'Replacement text.' },
			encoding: { type: 'string', description: 'Text encoding (default utf8).', default: 'utf8' },
		},
		required: ['path', 'oldText', 'newText'],
	},
	resultLimit: 40960,
};

interface IMatch {
	start: number;
	end: number;
	indent: string;
}

function getLineStarts(text: string): Array<number> {
	const out: Array<number> = [0];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			out.push(i + 1);
		}
	}
	return out;
}

function getLeadingWhitespace(line: string): string {
	return line.slice(0, line.length - line.trimStart().length);
}

function getCommonIndent(lines: Array<string>): string {
	let indent: string | null = null;
	for (const line of lines) {
		if (!line.trim()) {
			continue;
		}
		const lead = getLeadingWhitespace(line);
		if (indent === null) {
			indent = lead;
			continue;
		}
		let i = 0;
		while (i < indent.length && i < lead.length && indent[i] === lead[i]) {
			i++;
		}
		indent = indent.slice(0, i);
	}
	return indent ?? '';
}

function dedentLines(lines: Array<string>): Array<string> {
	const indent = getCommonIndent(lines);
	return lines.map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.trimStart()));
}

function reindent(text: string, indent: string): string {
	if (!indent) {
		return text;
	}
	return dedentLines(text.split('\n'))
		.map((l) => (l.trim() ? indent + l : l))
		.join('\n');
}

function normalizeEol(text: string): string {
	return text.replace(/\r\n/g, '\n');
}

function collapseWs(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function spanFromLines(lineStarts: Array<number>, contentLines: Array<string>, startLine: number, endLine: number): { start: number; end: number } {
	const start = lineStarts[startLine];
	const end = lineStarts[endLine] + contentLines[endLine].length;
	return { start, end };
}

function toMatch(content: string, start: number, end: number): IMatch {
	const lineStart = content.lastIndexOf('\n', start - 1) + 1;
	const prefix = content.slice(lineStart, start);
	const indent = prefix.trim() ? '' : getLeadingWhitespace(content.slice(lineStart));
	return { start, end, indent };
}

function matchExact(content: string, needle: string): Array<IMatch> {
	const out: Array<IMatch> = [];
	let idx = content.indexOf(needle);
	while (idx !== -1) {
		out.push(toMatch(content, idx, idx + needle.length));
		idx = content.indexOf(needle, idx + 1);
	}
	return out;
}

function matchLineTrimmed(content: string, needle: string): Array<IMatch> {
	const contentLines = content.split('\n');
	const lineStarts = getLineStarts(content);
	let needleLines = needle.split('\n');
	while (needleLines.length > 0 && !needleLines[needleLines.length - 1].trim()) {
		needleLines.pop();
	}
	while (needleLines.length > 0 && !needleLines[0].trim()) {
		needleLines.shift();
	}
	if (needleLines.length === 0) {
		return [];
	}
	const out: Array<IMatch> = [];
	for (let i = 0; i + needleLines.length <= contentLines.length; i++) {
		let ok = true;
		for (let j = 0; j < needleLines.length; j++) {
			if (contentLines[i + j].trim() !== needleLines[j].trim()) {
				ok = false;
				break;
			}
		}
		if (!ok) {
			continue;
		}
		const span = spanFromLines(lineStarts, contentLines, i, i + needleLines.length - 1);
		out.push(toMatch(content, span.start, span.end));
	}
	return out;
}

function matchWhitespaceInsensitive(content: string, needle: string): Array<IMatch> {
	const contentLines = content.split('\n');
	const lineStarts = getLineStarts(content);
	let needleLines = needle.split('\n');
	while (needleLines.length > 0 && !needleLines[needleLines.length - 1].trim()) {
		needleLines.pop();
	}
	while (needleLines.length > 0 && !needleLines[0].trim()) {
		needleLines.shift();
	}
	if (needleLines.length === 0) {
		return [];
	}
	const target = collapseWs(needleLines.join('\n'));
	const out: Array<IMatch> = [];
	for (let i = 0; i < contentLines.length; i++) {
		for (let len = 1; len <= needleLines.length + 2 && i + len <= contentLines.length; len++) {
			const slice = contentLines.slice(i, i + len).join('\n');
			if (collapseWs(slice) !== target) {
				continue;
			}
			const span = spanFromLines(lineStarts, contentLines, i, i + len - 1);
			out.push(toMatch(content, span.start, span.end));
			break;
		}
	}
	return out;
}

function levenshtein(a: string, b: string): number {
	if (a === b) {
		return 0;
	}
	if (!a.length) {
		return b.length;
	}
	if (!b.length) {
		return a.length;
	}
	let prev: Array<number> = new Array(b.length + 1);
	let curr: Array<number> = new Array(b.length + 1);
	for (let j = 0; j <= b.length; j++) {
		prev[j] = j;
	}
	for (let i = 1; i <= a.length; i++) {
		curr[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
		}
		const swap = prev;
		prev = curr;
		curr = swap;
	}
	return prev[b.length];
}

function lineSimilarity(a: string, b: string): number {
	const x = a.trim();
	const y = b.trim();
	if (!x && !y) {
		return 1;
	}
	const max = Math.max(x.length, y.length);
	if (max === 0) {
		return 1;
	}
	return 1 - levenshtein(x, y) / max;
}

function matchBlockAnchor(content: string, needle: string): Array<IMatch> {
	const contentLines = content.split('\n');
	const lineStarts = getLineStarts(content);
	const needleLines = needle.split('\n').filter((l) => l.trim());
	if (needleLines.length < 3) {
		return [];
	}
	const firstAnchor = needleLines[0].trim();
	const lastAnchor = needleLines[needleLines.length - 1].trim();
	const middle = needleLines.slice(1, -1);
	const span = needleLines.length;
	const out: Array<IMatch> = [];
	for (let i = 0; i < contentLines.length; i++) {
		if (contentLines[i].trim() !== firstAnchor) {
			continue;
		}
		const lo = Math.max(i + 1, i + span - 4);
		const hi = Math.min(contentLines.length - 1, i + span + 4);
		for (let j = lo; j <= hi; j++) {
			if (contentLines[j].trim() !== lastAnchor) {
				continue;
			}
			const candidateMiddle = contentLines.slice(i + 1, j).filter((l) => l.trim());
			if (!isMiddleSimilar(middle, candidateMiddle)) {
				continue;
			}
			const s = spanFromLines(lineStarts, contentLines, i, j);
			out.push(toMatch(content, s.start, s.end));
			break;
		}
	}
	return out;
}

function isMiddleSimilar(expected: Array<string>, actual: Array<string>): boolean {
	if (expected.length === 0 && actual.length === 0) {
		return true;
	}
	if (Math.abs(expected.length - actual.length) > 1) {
		return false;
	}
	const count = Math.min(expected.length, actual.length);
	if (count === 0) {
		return false;
	}
	let total = 0;
	for (let i = 0; i < count; i++) {
		total += lineSimilarity(expected[i], actual[i]);
	}
	return total / count >= 0.8;
}

function findMatch(content: string, oldText: string): IMatch {
	const strategies: Array<{ name: string; fn: (c: string, n: string) => Array<IMatch> }> = [
		{ name: 'exact', fn: matchExact },
		{ name: 'line-trimmed', fn: matchLineTrimmed },
		{ name: 'whitespace-insensitive', fn: matchWhitespaceInsensitive },
		{ name: 'block-anchor', fn: matchBlockAnchor },
	];
	for (const strategy of strategies) {
			const matches = strategy.fn(content, oldText);
			if (matches.length === 1) {
				const match = matches[0];
				const matchedLength = match.end - match.start;
				if (matchedLength > oldText.length * 1.5 && matchedLength - oldText.length > 80) {
					throw new Error('Refusing replacement because the matched span is much larger than oldText. Re-read the file and provide the exact text for the intended replacement.');
				}
				return match;
			}
		if (matches.length > 1) {
			throw new Error(`Found ${matches.length} matches for oldText (strategy: ${strategy.name}). Provide more surrounding context to make it unique.`);
		}
	}
	throw new Error(buildNotFoundError(content, oldText));
}

function buildNotFoundError(content: string, oldText: string): string {
	const contentLines = content.split('\n');
	const firstLine = oldText.split('\n').find((l) => l.trim()) ?? '';
	const target = firstLine.trim();
	const near: Array<string> = [];
	for (let i = 0; i < contentLines.length && near.length < 3; i++) {
		const line = contentLines[i].trim();
		if (!line || !target) {
			continue;
		}
		if (line === target || line.includes(target) || target.includes(line)) {
			near.push(`  line ${i + 1}: ${contentLines[i]}`);
		}
	}
	let msg = 'oldText not found in content.';
	if (near.length > 0) {
		msg += ` Closest lines in file:\n${near.join('\n')}`;
	}
	msg += '\nRe-read the file and copy the exact text before retrying.';
	return msg;
}

export async function filePatchHandler(deps: IWarpmcpDeps, args: { path: string; oldText: string; newText: string; encoding?: string }): Promise<{ success: boolean; fileSize: number; strategy: string }> {
	const safePath = await assertPathAllowed(deps.getFsAllowedRoots(), args.path);
	const encoding = (args.encoding ?? 'utf8') as BufferEncoding;
	if (!args.oldText) {
		throw new Error('oldText must be non-empty');
	}
	if (args.oldText === args.newText) {
		throw new Error('oldText and newText are identical, nothing to patch');
	}
	const raw = await fs.readFile(safePath, { encoding });
	const crlf = raw.includes('\r\n');
	const content = crlf ? normalizeEol(raw) : raw;
	const oldText = normalizeEol(args.oldText);
	const newText = normalizeEol(args.newText);
	const match = findMatch(content, oldText);
	const replacement = reindent(newText, match.indent);
	let next = content.substring(0, match.start) + replacement + content.substring(match.end);
	if (crlf) {
		next = next.replace(/\n/g, '\r\n');
	}
	await fs.writeFile(safePath, next, { encoding });
	await deps.onFileWritten?.(safePath);
	const stat = await fs.stat(safePath);
	return { success: true, fileSize: stat.size, strategy: 'matched' };
}
