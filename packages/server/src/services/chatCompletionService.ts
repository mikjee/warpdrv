// ============================================================
// FILE: packages/server/src/services/chatCompletionService.ts
// Backend chat completion with MCP tool-call orchestration.
// Uses Vercel AI SDK streamText, loops on tool calls,
// handles approval flow, persists everything.
// ============================================================

import crypto from 'crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import type { Response } from 'express';
import type {
	IChatCompletionRequest,
	IChatStreamEvent,
	IToolCall,
	IMcpToolDefinition,
} from '@warpcore/shared';
import { EToolApprovalMode, EToolCallStatus } from '@warpcore/shared';
import { store } from '../util/store';
import { chatDb, mcpDb } from '../util/chatDB';
import {
	getEnabledTools,
	getToolApprovalMode,
	executeToolCall,
	findToolServer,
	toolsToOpenAIFormat,
} from './mcpClientManager';
import { sseManager } from './sseManagerInstance';
import type { IServer } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

const SERVERS_PREFIX = 'servers:';
const MAX_TOOL_ITERATIONS = 10;

// Pending approval resolvers — keyed by tool call ID
// When a tool call needs approval, we store a promise resolver here.
// The approval endpoint resolves it.
const pendingApprovals = new Map<string, {
	resolve: (decision: 'approve' | 'deny') => void;
	threadId: string;
}>();

// Resolve a pending approval from the API endpoint
export function resolveToolCallApproval(toolCallId: string, decision: 'approve' | 'deny'): boolean {
	const pending = pendingApprovals.get(toolCallId);
	if (!pending) return false;
	pending.resolve(decision);
	pendingApprovals.delete(toolCallId);
	return true;
}

// Get pending approvals for a thread
export function getPendingApprovalsForThread(threadId: string): string[] {
	const ids: string[] = [];
	for (const [id, entry] of pendingApprovals.entries()) {
		if (entry.threadId === threadId) ids.push(id);
	}
	return ids;
}

// SSE write helper — writes a chat stream event to the response
function writeSSE(res: Response, event: IChatStreamEvent): void {
	res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// ============================================================
// Main chat completion handler
// ============================================================
export async function handleChatCompletion(
	req: IChatCompletionRequest,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	// Set up SSE response
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'X-Accel-Buffering': 'no',
	});

	try {
		// Resolve server port
		const server = await store.get<IServer>(`${SERVERS_PREFIX}${req.serverId}`);
		if (!server || server.status !== EServerStatus.RUNNING) {
			writeSSE(res, { type: 'error', error: 'Server not running. Select a running server.' });
			res.end();
			return;
		}

		const port = server.port;

		// Build message history
		const messages = req.systemPrompt
			? [{ role: 'system' as const, content: req.systemPrompt }, ...req.messages]
			: [...req.messages];

		// Get enabled tools
		const serverPerms = await mcpDb.getAllServerPermissions();
		const toolPerms = await mcpDb.getAllToolPermissions();
		const enabledTools = getEnabledTools(serverPerms, toolPerms);

		// Run the completion loop
		await completionLoop(
			port,
			messages,
			enabledTools,
			toolPerms,
			req,
			res,
			abortSignal,
		);

	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		if (!abortSignal.aborted) {
			writeSSE(res, { type: 'error', error: errorMsg });
		}
	} finally {
		if (!res.writableEnded) res.end();
	}
}

// ============================================================
// Completion loop — calls llama-server, handles tool calls
// ============================================================
async function completionLoop(
	port: number,
	messages: Array<{ role: string; content: string }>,
	enabledTools: IMcpToolDefinition[],
	toolPerms: Array<{ serverName: string; toolName: string; enabled: boolean; approvalMode: EToolApprovalMode }>,
	req: IChatCompletionRequest,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	const provider = createOpenAI({
		baseURL: `http://localhost:${port}/v1`,
		apiKey: 'warpcore',
	});

	const p = req.inferenceParams as Record<string, any>;
	let iteration = 0;
	let conversationMessages = [...messages];

	while (iteration < MAX_TOOL_ITERATIONS) {
		if (abortSignal.aborted) return;
		iteration++;

		// Build AI SDK tools from MCP tool definitions
		const aiTools: Record<string, any> = {};
		for (const t of enabledTools) {
			// We define tools without execute — we handle execution ourselves
			// so we can do approval flow
			aiTools[t.name] = tool({
				description: t.description,
				parameters: jsonSchemaToZod(t.inputSchema),
			});
		}

		const hasTools = Object.keys(aiTools).length > 0;

		const result = streamText({
			model: provider.chat('model'),
			messages: conversationMessages as any,
			abortSignal,
			...(hasTools ? { tools: aiTools } : {}),
			includeRawChunks: true,
			temperature: p.temperature,
			topP: p.topP ?? p.top_p,
			topK: p.topK ?? p.top_k,
			maxOutputTokens: p.maxTokens > 0 ? p.maxTokens : undefined,
			frequencyPenalty: p.frequencyPenalty,
			presencePenalty: p.presencePenalty,
			seed: p.seed >= 0 ? p.seed : undefined,
			providerOptions: {
				openai: {
					...(p.repeatPenalty !== 1.0 ? { repeat_penalty: p.repeatPenalty } : {}),
					...(p.minP > 0 ? { min_p: p.minP } : {}),
					...(p.mirostatMode > 0 ? { mirostat: p.mirostatMode, mirostat_tau: p.mirostatTau, mirostat_eta: p.mirostatEta } : {}),
					...(p.cachePrompt ? { cache_prompt: true } : {}),
					...(p.responseFormat !== 'text' ? { response_format: { type: p.responseFormat } } : {}),
					...(p.reasoningFormat !== 'none' ? { reasoning_format: p.reasoningFormat } : {}),
					...(p.enableThinking || (p.reasoningEffort && p.reasoningEffort !== 'none')
						? { chat_template_kwargs: {
							...(p.enableThinking ? { enable_thinking: true } : {}),
							...(p.reasoningEffort && p.reasoningEffort !== 'none' ? { reasoning_effort: p.reasoningEffort } : {}),
						} }
						: {}),
				},
			},
		});

		let fullText = '';
		let reasoningText = '';
		let timings: any = null;
		let toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
		let finishReason = '';

		for await (const part of (await result).fullStream) {
			if (abortSignal.aborted) return;

			if (part.type === 'reasoning-delta') {
				reasoningText += part.text;
				writeSSE(res, { type: 'reasoning-delta', text: reasoningText });
			} else if (part.type === 'text-delta') {
				fullText += part.text;
				writeSSE(res, { type: 'text-delta', text: fullText });
			} else if (part.type === 'tool-call') {
				toolCalls.push({
					id: part.toolCallId,
					name: part.toolName,
					args: part.args as Record<string, unknown>,
				});
			} else if (part.type === 'finish') {
				finishReason = part.finishReason ?? '';
			} else if (part.type === 'raw') {
				try {
					const raw = part.rawValue as any;
					if (raw?.timings) timings = raw.timings;
				} catch { /* ignore */ }
			}
		}

		// No tool calls — we're done, emit final event
		if (toolCalls.length === 0 || finishReason !== 'tool-calls') {
			const usage = await (await result).usage;
			const reasoningTokens = (usage as any)?.outputTokenDetails?.reasoningTokens ?? 0;
			const ppSpeed = timings?.prompt_per_second ?? 0;
			const tgSpeed = timings?.predicted_per_second ?? 0;
			const promptTokens = timings?.prompt_n ?? usage?.inputTokens ?? 0;
			const completionTokens = timings?.predicted_n ?? usage?.outputTokens ?? 0;
			const ppMs = timings?.prompt_ms ?? 0;
			const tgMs = timings?.predicted_ms ?? 0;

			writeSSE(res, {
				type: 'done',
				text: fullText,
				metadata: {
					promptTokens,
					completionTokens,
					reasoningTokens,
					ppSpeed: Math.round(ppSpeed * 100) / 100,
					tgSpeed: Math.round(tgSpeed * 100) / 100,
					ttftMs: Math.round(ppMs),
					totalMs: Math.round(ppMs + tgMs),
				},
			});
			return;
		}

		// Handle tool calls
		const toolResults: Array<{ callId: string; name: string; result: string }> = [];

		for (const tc of toolCalls) {
			if (abortSignal.aborted) return;

			const serverName = findToolServer(tc.name);
			if (!serverName) {
				const errorResult = JSON.stringify({ error: `No MCP server found for tool '${tc.name}'` });
				toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
				continue;
			}

			// Create tool call record
			const toolCallId = crypto.randomUUID();
			const toolCallRecord: IToolCall = {
				id: toolCallId,
				messageId: '', // will be linked when message is saved
				threadId: req.threadId,
				serverName,
				toolName: tc.name,
				arguments: JSON.stringify(tc.args),
				result: null,
				status: EToolCallStatus.PENDING,
				error: null,
				createdAt: Date.now(),
				resolvedAt: null,
			};
			await mcpDb.createToolCall(toolCallRecord);

			// Check approval mode
			const approvalMode = getToolApprovalMode(serverName, tc.name, toolPerms);

			// Notify frontend about the tool call
			writeSSE(res, {
				type: 'tool-call',
				toolCall: {
					id: toolCallId,
					serverName,
					toolName: tc.name,
					arguments: JSON.stringify(tc.args),
					status: EToolCallStatus.PENDING,
				},
			});

			let decision: 'approve' | 'deny' = 'approve';

			if (approvalMode === EToolApprovalMode.DENIED) {
				decision = 'deny';
			} else if (approvalMode === EToolApprovalMode.ASK) {
				// Wait for user approval
				decision = await waitForApproval(toolCallId, req.threadId, abortSignal);
			}
			// ALLOWED falls through with decision = 'approve'

			if (decision === 'deny' || abortSignal.aborted) {
				await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.DENIED);
				const deniedResult = JSON.stringify({ error: 'Tool call was denied by user' });
				toolResults.push({ callId: tc.id, name: tc.name, result: deniedResult });

				writeSSE(res, {
					type: 'tool-result',
					toolResult: {
						id: toolCallId,
						result: deniedResult,
						status: EToolCallStatus.DENIED,
					},
				});
				continue;
			}

			// Execute the tool
			await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.EXECUTING);

			try {
				const mcpResult = await executeToolCall(serverName, tc.name, tc.args);
				const resultStr = JSON.stringify(mcpResult.content);

				await mcpDb.updateToolCallStatus(
					toolCallId,
					mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED,
					resultStr,
					mcpResult.isError ? resultStr : null,
				);

				toolResults.push({ callId: tc.id, name: tc.name, result: resultStr });

				writeSSE(res, {
					type: 'tool-result',
					toolResult: {
						id: toolCallId,
						result: resultStr,
						status: mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED,
					},
				});
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				const errorResult = JSON.stringify({ error: errorMsg });

				await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.ERROR, null, errorMsg);

				toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });

				writeSSE(res, {
					type: 'tool-result',
					toolResult: {
						id: toolCallId,
						result: errorResult,
						status: EToolCallStatus.ERROR,
					},
				});
			}
		}

		// Append tool calls and results to conversation for next iteration
		// Add the assistant message with tool calls
		conversationMessages.push({
			role: 'assistant',
			content: fullText || '',
			// The AI SDK handles tool_calls in the message format internally
			// but we need to manually construct the follow-up for the loop
		} as any);

		// Add tool results as tool messages
		for (const tr of toolResults) {
			conversationMessages.push({
				role: 'tool' as any,
				content: tr.result,
				tool_call_id: tr.callId,
			} as any);
		}

		// Continue the loop — llama-server gets called again with the tool results
	}

	// Hit max iterations
	writeSSE(res, {
		type: 'error',
		error: `Tool call loop exceeded maximum of ${MAX_TOOL_ITERATIONS} iterations`,
	});
}

// Wait for user approval via the pending approvals map
function waitForApproval(
	toolCallId: string,
	threadId: string,
	abortSignal: AbortSignal,
): Promise<'approve' | 'deny'> {
	return new Promise<'approve' | 'deny'>((resolve) => {
		pendingApprovals.set(toolCallId, { resolve, threadId });

		// If aborted, auto-deny
		const onAbort = () => {
			if (pendingApprovals.has(toolCallId)) {
				pendingApprovals.delete(toolCallId);
				resolve('deny');
			}
		};
		abortSignal.addEventListener('abort', onAbort, { once: true });
	});
}

// ============================================================
// Handle chat completion for proxy clients (auto-execute all)
// This is a simpler path — no approval flow, all enabled tools
// are auto-executed.
// ============================================================
export async function handleProxyChatCompletion(
	port: number,
	messages: Array<{ role: string; content: string }>,
	inferenceParams: Record<string, any>,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	// For proxy, get all enabled tools and auto-execute
	const serverPerms = await mcpDb.getAllServerPermissions();
	const toolPerms = await mcpDb.getAllToolPermissions();
	const enabledTools = getEnabledTools(serverPerms, toolPerms);

	// Set all tools to ALLOWED for proxy context
	const proxyToolPerms = toolPerms.map(p => ({
		...p,
		approvalMode: p.approvalMode === EToolApprovalMode.DENIED
			? EToolApprovalMode.DENIED // respect disabled
			: EToolApprovalMode.ALLOWED, // auto-approve everything else
	}));

	const req: IChatCompletionRequest = {
		threadId: `proxy-${crypto.randomUUID()}`,
		messages: messages as any,
		serverId: '', // not used in proxy path
		inferenceParams,
	};

	await completionLoop(
		port,
		messages,
		enabledTools,
		proxyToolPerms,
		req,
		res,
		abortSignal,
	);
}

// ============================================================
// JSON Schema to Zod converter (basic)
// Converts MCP tool input schemas to Zod for the AI SDK
// ============================================================
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
	// The AI SDK accepts JSON Schema directly via jsonSchema()
	// but tool() expects Zod. For compatibility, we use z.object
	// with a passthrough for unknown properties.
	// This is a pragmatic approach — the actual validation happens
	// on the MCP server side.
	return z.record(z.unknown()).describe(
		(schema.description as string) ?? ''
	);
}

export async function restorePendingApprovals(): Promise<void> {
	const pending = await mcpDb.getPendingToolCalls();
	if (pending.length === 0) return;

	console.log(`[MCP] Restoring ${pending.length} pending tool call approval(s)`);

	for (const tc of pending) {
		// Re-emit the pending tool call over SSE so the frontend
		// can show the approval dialog again
		sseManager.emit('mcp:pending-approval', {
			id: tc.id,
			threadId: tc.threadId,
			serverName: tc.serverName,
			toolName: tc.toolName,
			arguments: tc.arguments,
			status: tc.status,
		});
	}
}
