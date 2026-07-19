// ============================================================
// warpbridge/src/parser/index.ts
// Parses OpenAI-compatible SSE streams.
// Universal — works in Node and browser.
// ============================================================

import type { ISSEChunk } from '../types';

// Parse a single SSE line into a chunk object, or null if not a data line.
export function parseSSELine(line: string): ISSEChunk | null {
	if (!line.startsWith('data: ')) return null;
	const data = line.slice(6).trim();
	if (data === '[DONE]') return null;
	if (!data) return null;
	try {
		return JSON.parse(data) as ISSEChunk;
	} catch {
		return null;
	}
}

// Parse a buffer of SSE text, returning parsed chunks and the remaining buffer.
export function parseSSEBuffer(buffer: string): { chunks: ISSEChunk[]; remaining: string; done: boolean } {
	const lines = buffer.split('\n');
	const remaining = lines.pop() ?? '';
	const chunks: ISSEChunk[] = [];
	let done = false;
	for (const line of lines) {
		if (line.trim() === 'data: [DONE]') {
			done = true;
			continue;
		}
		const chunk = parseSSELine(line);
		if (chunk) chunks.push(chunk);
	}
	return { chunks, remaining, done };
}

// Check if a line indicates the stream is done.
export function isStreamDone(line: string): boolean {
	return line.trim() === 'data: [DONE]';
}

// Accumulate tool call deltas from streaming chunks.
// Tool calls arrive as fragments across multiple chunks.
export interface IToolCallAccumulator {
	id: string;
	name: string;
	arguments: string;
}

export function accumulateToolCallDelta(
	accumulators: Record<number, IToolCallAccumulator>,
	delta: { index: number; id?: string; function?: { name?: string; arguments?: string } },
): void {
	const idx = delta.index;
	if (!accumulators[idx]) {
		accumulators[idx] = { id: '', name: '', arguments: '' };
	}
	const acc = accumulators[idx];
	if (delta.id) acc.id = delta.id;
	if (delta.function?.name) acc.name = delta.function.name;
	if (delta.function?.arguments) acc.arguments += delta.function.arguments;
}

// Convert accumulated tool calls into a clean array.
export function finalizeToolCalls(
	accumulators: Record<number, IToolCallAccumulator>,
): Array<{ id: string; name: string; arguments: string }> {
	return Object.values(accumulators).filter(a => a.id && a.name);
}
