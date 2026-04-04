// ============================================================
// FILE: packages/server/src/services/chatCompletionService.ts
// Full drop-in replacement.
// Transport: raw res.write (OpenAI-compatible SSE)
// Format: data: {...}\n\n chunks
// Flow: single pass, auto-continue for ALLOWED, break for ASK
// ============================================================

import crypto from 'crypto';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, jsonSchema } from 'ai';
import type { Request, Response } from 'express';
import type {
	IChatCompletionRequest,
	IChatStreamEvent,
	IToolCall,
	IMcpToolDefinition,
} from '@warpcore/shared';
import { EToolApprovalMode, EToolCallStatus } from '@warpcore/shared';
import { store } from '../util/store';
import { mcpDb } from '../util/chatDB';
import {
	getEnabledTools,
	getToolApprovalMode,
	executeToolCall,
	findToolServer,
} from './mcpClientManager';
import { sseManager } from './sseManagerInstance';
import type { IServer } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

const SERVERS_PREFIX = 'servers:';
const MAX_AUTO_CONTINUES = 10;

// ============================================================
// Helpers
// ============================================================
function write(res: Response, data: Record<string, unknown>): void {
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function writeDone(res: Response): void {
	res.write('data: [DONE]\n\n');
}

function chunkDelta(delta: Record<string, unknown>, extra?: Record<string, unknown>): Record<string, unknown> {
	return {
		choices: [{ index: 0, delta }],
		...(extra ?? {}),
	};
}

function chunkFinish(reason: string, timings?: any, usage?: any): Record<string, unknown> {
	return {
		choices: [{ index: 0, delta: {}, finish_reason: reason }],
		...(timings ? { timings } : {}),
		...(usage ? { usage } : {}),
	};
}

function chunkToolCall(index: number, id: string, name: string, args: string): Record<string, unknown> {
	return {
		choices: [{
			index: 0,
			delta: {
				tool_calls: [{
					index,
					id,
					type: 'function',
					function: { name, arguments: args },
				}],
			},
		}],
	};
}

function chunkWarpcore(event: string, data: Record<string, unknown>): Record<string, unknown> {
	return { warpcore_event: event, ...data };
}

function startSSE(res: Response): void {
	res.writeHead(200, {
		'Content-Type': 'text/event-stream',
		'Cache-Control': 'no-cache',
		'Connection': 'keep-alive',
		'X-Accel-Buffering': 'no',
	});
	res.flushHeaders();
}

// ============================================================
// Main chat completion handler
// ============================================================
export async function handleChatCompletion(
	req: IChatCompletionRequest,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	const server = await store.get<IServer>(`${SERVERS_PREFIX}${req.serverId}`);
	if (!server || server.status !== EServerStatus.RUNNING) {
		res.status(400).json({ ok: false, data: null, error: 'Server not running. Select a running server.' });
		return;
	}

	startSSE(res);

	try {
		const port = server.port;
		const messages = req.systemPrompt
			? [{ role: 'system' as const, content: req.systemPrompt }, ...req.messages]
			: [...req.messages];

		const serverPerms = await mcpDb.getAllServerPermissions();
		const toolPerms = await mcpDb.getAllToolPermissions();
		const enabledTools = getEnabledTools(serverPerms, toolPerms);

		await singlePass(port, messages, enabledTools, toolPerms, req, res, abortSignal);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		if (!abortSignal.aborted) {
			write(res, chunkWarpcore('error', { error: errorMsg }));
		}
	} finally {
		writeDone(res);
		res.end();
	}
}

// ============================================================
// Single pass
// ============================================================
async function singlePass(
	port: number,
	messages: Array<{ role: string; content: string }>,
	enabledTools: IMcpToolDefinition[],
	toolPerms: Array<{ serverName: string; toolName: string; enabled: boolean; approvalMode: EToolApprovalMode }>,
	req: IChatCompletionRequest,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	const openAiTools = enabledTools.map(t => ({
		type: 'function' as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: {
				...t.inputSchema,
				$schema: undefined,
			},
		},
	}));
	const hasTools = openAiTools.length > 0;

	const provider = createOpenAI({
		baseURL: `http://localhost:${port}/v1`,
		apiKey: 'warpcore',
		fetch: async (url, init) => {
			if (init?.body && typeof init.body === 'string') {
				const body = JSON.parse(init.body);
				if (hasTools) body.tools = openAiTools;
				body.messages = conversationMessages;
				init = { ...init, body: JSON.stringify(body) };
			}
			return fetch(url, init);
		},
	});

	const p = req.inferenceParams as Record<string, any>;
	let conversationMessages = [...messages];
	let autoContinues = 0;

	while (autoContinues < MAX_AUTO_CONTINUES) {
		if (abortSignal.aborted) return;

		const aiTools: Record<string, any> = {};
		for (const t of enabledTools) {
			aiTools[t.name] = tool({
				description: t.description,
				parameters: mcpSchemaToAISchema(t.inputSchema),
			});
		}

		const result = streamText({
			model: provider.chat('model'),
			messages: [conversationMessages[0]] as any,
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
				write(res, chunkDelta({ reasoning_content: part.text }));
			} else if (part.type === 'text-delta') {
				fullText += part.text;
				write(res, chunkDelta({ content: part.text }));
			} else if (part.type === 'tool-call') {
				toolCalls.push({
					id: part.toolCallId,
					name: part.toolName,
					args: (part as any).input ?? (part as any).args ?? {},
				});
			} else if (part.type === 'finish') {
				finishReason = part.finishReason ?? '';
			} else if (part.type === 'raw') {
				try {
					const raw = part.rawValue as any;
					if (raw?.timings) timings = raw.timings;
					const delta = raw?.choices?.[0]?.delta;
					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						write(res, chunkDelta({ reasoning_content: delta.reasoning_content }));
					}
				} catch { /* ignore */ }
			}
		}

		// Text response — done
		if (toolCalls.length === 0 || finishReason !== 'tool-calls') {
			const usage = await (await result).usage;
			const reasoningTokens = (usage as any)?.outputTokenDetails?.reasoningTokens ?? 0;

			write(res, chunkFinish('stop', timings, {
				prompt_tokens: timings?.prompt_n ?? usage?.inputTokens ?? 0,
				completion_tokens: timings?.predicted_n ?? usage?.outputTokens ?? 0,
				reasoning_tokens: reasoningTokens,
			}));
			return;
		}

		// Tool calls
		let needsAsk = false;
		const toolResults: Array<{ callId: string; name: string; result: string }> = [];

		for (let i = 0; i < toolCalls.length; i++) {
			const tc = toolCalls[i]!;
			if (abortSignal.aborted) return;

			const serverName = findToolServer(tc.name);
			if (!serverName) {
				const errorResult = JSON.stringify({ error: `No MCP server found for tool '${tc.name}'` });
				toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
				continue;
			}

			const toolCallId = crypto.randomUUID();
			const toolCallRecord: IToolCall = {
				id: toolCallId,
				messageId: '',
				threadId: req.threadId,
				serverName,
				toolName: tc.name,
				arguments: JSON.stringify(tc.args ?? {}),
				result: null,
				status: EToolCallStatus.PENDING,
				error: null,
				createdAt: Date.now(),
				resolvedAt: null,
			};
			await mcpDb.createToolCall(toolCallRecord);

			const approvalMode = getToolApprovalMode(serverName, tc.name, toolPerms);

			write(res, chunkToolCall(i, tc.id, tc.name, JSON.stringify(tc.args)));

			// ASK
			if (approvalMode === EToolApprovalMode.ASK) {
				write(res, chunkWarpcore('tool_call_pending', {
					tool_call_id: toolCallId,
					server_name: serverName,
					tool_name: tc.name,
					arguments: JSON.stringify(tc.args ?? {}),
				}));
				needsAsk = true;
				continue;
			}

			// DENIED
			if (approvalMode === EToolApprovalMode.DENIED) {
				await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.DENIED);
				const deniedResult = JSON.stringify({ error: 'Tool call denied by policy' });
				toolResults.push({ callId: tc.id, name: tc.name, result: deniedResult });
				write(res, chunkWarpcore('tool_call_result', {
					tool_call_id: toolCallId,
					status: EToolCallStatus.DENIED,
					result: deniedResult,
				}));
				continue;
			}

			// ALLOWED
			await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.EXECUTING);
			write(res, chunkWarpcore('tool_call_executing', { tool_call_id: toolCallId }));

			try {
				const mcpResult = await executeToolCall(serverName, tc.name, tc.args);
				const resultStr = JSON.stringify(mcpResult.content);
				const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;

				await mcpDb.updateToolCallStatus(toolCallId, finalStatus, resultStr, mcpResult.isError ? resultStr : null);
				toolResults.push({ callId: tc.id, name: tc.name, result: resultStr });

				write(res, chunkWarpcore('tool_call_result', {
					tool_call_id: toolCallId,
					status: finalStatus,
					result: resultStr,
				}));
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				const errorResult = JSON.stringify({ error: errorMsg });

				await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.ERROR, null, errorMsg);
				toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });

				write(res, chunkWarpcore('tool_call_result', {
					tool_call_id: toolCallId,
					status: EToolCallStatus.ERROR,
					result: errorResult,
				}));
			}
		}

		// ASK — stop, frontend will resume
		if (needsAsk) {
			write(res, chunkFinish('tool_calls'));
			return;
		}

		// Append tool results and continue
		conversationMessages.push({
			role: 'assistant',
			content: fullText || null,
			tool_calls: toolCalls.map((tc, i) => ({
				id: tc.id,
				type: 'function',
				function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) },
			})),
		} as any);

		for (const tr of toolResults) {
			conversationMessages.push({
				role: 'tool',
				content: tr.result,
				tool_call_id: tr.callId,
			} as any);
		}

		autoContinues++;
	}

	write(res, chunkWarpcore('error', {
		error: `Tool auto-execution exceeded maximum of ${MAX_AUTO_CONTINUES} continues`,
	}));
}

// ============================================================
// Resume after approval
// ============================================================
export async function resumeAfterApproval(
	toolCallId: string,
	decision: 'approve' | 'deny',
	res: Response,
): Promise<void> {
	const tc = await mcpDb.getToolCall(toolCallId);
	if (!tc) {
		res.status(404).json({ ok: false, data: null, error: 'Tool call not found' });
		return;
	}
	if (tc.status !== EToolCallStatus.PENDING) {
		res.status(400).json({ ok: false, data: null, error: `Tool call is ${tc.status}, not PENDING` });
		return;
	}

	if (decision === 'deny') {
		await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.DENIED);
		res.json({ ok: true, data: { status: EToolCallStatus.DENIED }, error: null });
		return;
	}

	await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.EXECUTING);

	try {
		const args = JSON.parse(tc.arguments);
		const mcpResult = await executeToolCall(tc.serverName, tc.toolName, args);
		const resultStr = JSON.stringify(mcpResult.content);
		const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;

		await mcpDb.updateToolCallStatus(toolCallId, finalStatus, resultStr, mcpResult.isError ? resultStr : null);

		res.json({
			ok: true,
			data: { status: finalStatus, result: resultStr, threadId: tc.threadId },
			error: null,
		});
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		await mcpDb.updateToolCallStatus(toolCallId, EToolCallStatus.ERROR, null, errorMsg);
		res.status(500).json({ ok: false, data: null, error: errorMsg });
	}
}

// ============================================================
// Proxy handler
// ============================================================
export async function handleProxyChatCompletion(
	port: number,
	messages: Array<{ role: string; content: string }>,
	inferenceParams: Record<string, any>,
	res: Response,
	abortSignal: AbortSignal,
): Promise<void> {
	const serverPerms = await mcpDb.getAllServerPermissions();
	const toolPerms = await mcpDb.getAllToolPermissions();
	const enabledTools = getEnabledTools(serverPerms, toolPerms);

	const proxyToolPerms = toolPerms.map(p => ({
		...p,
		approvalMode: p.approvalMode === EToolApprovalMode.DENIED
			? EToolApprovalMode.DENIED
			: EToolApprovalMode.ALLOWED,
	}));

	startSSE(res);

	const req: IChatCompletionRequest = {
		threadId: `proxy-${crypto.randomUUID()}`,
		messages: messages as any,
		serverId: '',
		inferenceParams,
	};

	try {
		await singlePass(port, messages, enabledTools, proxyToolPerms, req, res, abortSignal);
	} catch (err) {
		const errorMsg = err instanceof Error ? err.message : String(err);
		write(res, chunkWarpcore('error', { error: errorMsg }));
	} finally {
		writeDone(res);
		res.end();
	}
}

// ============================================================
// Restore pending approvals on startup
// ============================================================
export async function restorePendingApprovals(): Promise<void> {
	const pending = await mcpDb.getPendingToolCalls();
	if (pending.length === 0) return;

	console.log(`[MCP] Restoring ${pending.length} pending tool call approval(s)`);

	for (const tc of pending) {
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

function mcpSchemaToAISchema(schema: Record<string, unknown>): any {
	const clean = { ...schema };
	delete clean['$schema'];
	return clean;
}