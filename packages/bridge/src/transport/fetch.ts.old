// ============================================================
// warpbridge/src/transport/fetch.ts
// Default transport using fetch + SSE parsing.
// Universal — works in Node 18+ and browser.
// ============================================================

import type { ITransport } from '../types/interfaces';
import type { ICompletionRequest, ISSEChunk, TToolCallId, TThreadId, EToolCallStatus } from '../types';
import { parseSSEBuffer } from '../parser';

export interface IFetchTransportConfig {
	baseUrl: string; // e.g. "http://localhost:4401" or "" for relative
	completionPath?: string; // default: "/api/chat/completions"
	toolCallResumePath?: string; // default: "/api/chat/tool-calls"
	headers?: Record<string, string>;
}

export class FetchTransport implements ITransport {
	private config: IFetchTransportConfig;
	private abortControllers: Map<TThreadId, AbortController> = new Map();

	constructor(config: IFetchTransportConfig) {
		this.config = {
			completionPath: '/api/chat/completions',
			toolCallResumePath: '/api/chat/tool-calls',
			...config,
		};
	}

	async *startCompletion(request: ICompletionRequest): AsyncIterable<ISSEChunk> {
		const controller = new AbortController();
		this.abortControllers.set(request.threadId, controller);

		const url = `${this.config.baseUrl}${this.config.completionPath}`;
		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(this.config.headers ?? {}),
			},
			body: JSON.stringify(request),
			signal: controller.signal,
		});

		if (!response.ok || !response.body) {
			this.abortControllers.delete(request.threadId);
			throw new Error(`Completion request failed: ${response.status} ${response.statusText}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const { chunks, remaining } = parseSSEBuffer(buffer);
				buffer = remaining;

				for (const chunk of chunks) {
					yield chunk;
				}
			}
		} finally {
			this.abortControllers.delete(request.threadId);
		}
	}

	cancelCompletion(threadId: TThreadId): void {
		const controller = this.abortControllers.get(threadId);
		if (controller) {
			controller.abort();
			this.abortControllers.delete(threadId);
		}
	}

	async approveToolCall(id: TToolCallId): Promise<{ status: EToolCallStatus; result?: string }> {
		const url = `${this.config.baseUrl}${this.config.toolCallResumePath}/${id}/resume`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.config.headers ?? {}) },
			body: JSON.stringify({ decision: 'approve' }),
		});
		const json = await res.json() as any;
		return json.data;
	}

	async denyToolCall(id: TToolCallId): Promise<{ status: EToolCallStatus }> {
		const url = `${this.config.baseUrl}${this.config.toolCallResumePath}/${id}/resume`;
		const res = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...(this.config.headers ?? {}) },
			body: JSON.stringify({ decision: 'deny' }),
		});
		const json = await res.json() as any;
		return json.data;
	}
}
