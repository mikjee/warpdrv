// ============================================================
// warpbridge/src/orchestrator/index.ts
// Core inference orchestrator. Calls the inference server,
// handles tool calls, respects permissions.
// Node only — runs on the backend.
// ============================================================

import crypto from 'crypto';
import type { Response } from 'express';
import type { IMcpClient, IPermissions, IPersistence } from '../types/interfaces';
import type {
	ICompletionRequest,
	IToolDefinition,
	IToolCall,
	IOpenAITool,
	IChatMessageStats,
	TMessageId,
} from '../types';
import { EToolCallStatus, EToolApprovalMode } from '../types';
import { parseSSEBuffer, accumulateToolCallDelta, finalizeToolCalls, type IToolCallAccumulator } from '../parser';
import { validateToolArgs } from '../validation';
import { cleanSchema } from '../validation';

const MAX_AUTO_CONTINUES = 10;

export interface IOrchestratorConfig {
	mcpClient: IMcpClient;
	permissions: IPermissions;
	persistence: IPersistence;
	onMcpServersChanged?: (servers: Record<string, unknown>) => void;
}

export class Orchestrator {
	private mcpClient: IMcpClient;
	private permissions: IPermissions;
	private persistence: IPersistence;

	constructor(config: IOrchestratorConfig) {
		this.mcpClient = config.mcpClient;
		this.permissions = config.permissions;
		this.persistence = config.persistence;
	}

	// ============================================================
	// Stream a completion to the client via raw SSE
	// ============================================================
	async handleCompletion(
		inferenceUrl: string,
		request: ICompletionRequest,
		res: Response,
		abortSignal: AbortSignal,
	): Promise<void> {
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no',
		});
		res.flushHeaders();

		try {
			const allTools = this.mcpClient.getAllTools();
			const enabledTools = await this.permissions.getEnabledTools(allTools);
			const messages = request.systemPrompt
				? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages]
				: [...request.messages];

			await this.runPass(inferenceUrl, messages, enabledTools, request, res, abortSignal);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (!abortSignal.aborted) {
				this.write(res, { warpcore_event: 'error', error: errorMsg });
			}
		} finally {
			res.write('data: [DONE]\n\n');
			res.end();
		}
	}

	// ============================================================
	// Single pass — call inference, handle tool results, auto-continue
	// ============================================================
	private async runPass(
		inferenceUrl: string,
		messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
		res: Response,
		abortSignal: AbortSignal,
	): Promise<void> {
		let conversationMessages = [...messages];
		let autoContinues = 0;

		// Build OpenAI tool definitions
		const openAiTools: IOpenAITool[] = enabledTools.map(t => ({
			type: 'function' as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: cleanSchema(t.inputSchema),
			},
		}));
		const hasTools = openAiTools.length > 0;

		while (autoContinues < MAX_AUTO_CONTINUES) {
			if (abortSignal.aborted) return;

			// Build request body
			const body: Record<string, unknown> = {
				model: 'model',
				messages: conversationMessages,
				stream: true,
				...(hasTools ? { tools: openAiTools } : {}),
				...this.buildInferenceParams(request.inferenceParams),
			};

			// Call inference server
			const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer warpcore' },
				body: JSON.stringify(body),
				signal: abortSignal,
			});

			if (!response.ok || !response.body) {
				this.write(res, { warpcore_event: 'error', error: `Inference error: ${response.status}` });
				return;
			}

			// Parse streaming response
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let fullText = '';
			let reasoningText = '';
			let timings: Record<string, number> | null = null;
			let usage: Record<string, number> | null = null;
			let finishReason = '';
			const toolCallAccumulators: Record<number, IToolCallAccumulator> = {};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const { chunks, remaining } = parseSSEBuffer(buffer);
				buffer = remaining;

				for (const chunk of chunks) {
					if (abortSignal.aborted) return;

					// Text content
					const delta = chunk.choices?.[0]?.delta;
					if (delta?.content) {
						fullText += delta.content;
						this.write(res, { choices: [{ index: 0, delta: { content: delta.content } }] });
					}

					// Reasoning content
					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						this.write(res, { choices: [{ index: 0, delta: { reasoning_content: delta.reasoning_content } }] });
					}

					// Tool call deltas
					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							accumulateToolCallDelta(toolCallAccumulators, tc);
						}
					}

					// Finish reason
					const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) finishReason = fr;

					// Timings and usage
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}

			// Text response — done
			const finalToolCalls = finalizeToolCalls(toolCallAccumulators);
			if (finalToolCalls.length === 0 || finishReason !== 'tool_calls') {
				this.write(res, {
					choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
					...(timings ? { timings } : {}),
					...(usage ? { usage } : {}),
				});
				return;
			}

			// Emit tool calls in OpenAI format
			for (let i = 0; i < finalToolCalls.length; i++) {
				const tc = finalToolCalls[i]!;
				this.write(res, {
					choices: [{
						index: 0,
						delta: {
							tool_calls: [{
								index: i, id: tc.id, type: 'function',
								function: { name: tc.name, arguments: tc.arguments },
							}],
						},
					}],
				});
			}

			// Generate assistant message ID for linking tool calls
			const assistantMessageId = crypto.randomUUID();

			// Process tool calls
			let needsAsk = false;
			const toolResults: Array<{ callId: string; name: string; result: string }> = [];

			for (const tc of finalToolCalls) {
				if (abortSignal.aborted) return;

				const serverName = this.mcpClient.findToolServer(tc.name);
				if (!serverName) {
					const errorResult = JSON.stringify({ error: `No MCP server for tool '${tc.name}'` });
					toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
					continue;
				}

				// Parse arguments
				let args: Record<string, unknown> = {};
				try { args = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }

				// Validate arguments
				const toolDef = enabledTools.find(t => t.name === tc.name);
				if (toolDef) {
					const validation = validateToolArgs(toolDef.inputSchema, args);
					if (!validation.valid) {
						const errorResult = JSON.stringify({ error: `Invalid arguments: ${validation.errors.join(', ')}` });
						toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
						this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: tc.id, status: EToolCallStatus.ERROR, result: errorResult });
						continue;
					}
				}

				// Persist tool call
				const toolCallId = crypto.randomUUID();
				const toolCallRecord: IToolCall = {
					id: toolCallId,
					messageId: assistantMessageId,
					threadId: request.threadId,
					serverName,
					toolName: tc.name,
					arguments: JSON.stringify(args),
					result: null,
					status: EToolCallStatus.PENDING,
					error: null,
					createdAt: Date.now(),
					resolvedAt: null,
				};
				await this.persistence.createToolCall(toolCallRecord);

				const approvalMode = await this.permissions.getToolApprovalMode(serverName, tc.name);

				// ASK — break
				if (approvalMode === EToolApprovalMode.ASK) {
					this.write(res, {
						warpcore_event: 'tool_call_pending',
						tool_call_id: toolCallId,
						server_name: serverName,
						tool_name: tc.name,
						arguments: JSON.stringify(args),
					});
					needsAsk = true;
					continue;
				}

				// DENIED
				if (approvalMode === EToolApprovalMode.DENIED) {
					await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.DENIED, resolvedAt: Date.now() });
					const deniedResult = JSON.stringify({ error: 'Tool call denied by policy' });
					toolResults.push({ callId: tc.id, name: tc.name, result: deniedResult });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: EToolCallStatus.DENIED, result: deniedResult });
					continue;
				}

				// ALLOWED — execute
				await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
				this.write(res, { warpcore_event: 'tool_call_executing', tool_call_id: toolCallId });

				try {
					const mcpResult = await this.mcpClient.executeToolCall(serverName, tc.name, args);
					const resultStr = JSON.stringify(mcpResult.content);
					const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;

					await this.persistence.updateToolCall(toolCallId, { status: finalStatus, result: resultStr, error: mcpResult.isError ? resultStr : null, resolvedAt: Date.now() });
					toolResults.push({ callId: tc.id, name: tc.name, result: resultStr });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: finalStatus, result: resultStr });
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					const errorResult = JSON.stringify({ error: errorMsg });

					await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.ERROR, error: errorMsg, resolvedAt: Date.now() });
					toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: EToolCallStatus.ERROR, result: errorResult });
				}
			}

			// ASK — stop here
			if (needsAsk) {
				this.write(res, { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
				return;
			}

			// Append tool results and continue
			conversationMessages.push({
				role: 'assistant',
				content: fullText || null as any,
				tool_calls: finalToolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: { name: tc.name, arguments: tc.arguments },
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

		this.write(res, { warpcore_event: 'error', error: `Tool auto-execution exceeded ${MAX_AUTO_CONTINUES} iterations` });
	}

	// ============================================================
	// Resume after tool call approval
	// ============================================================
	async resumeToolCall(
		toolCallId: string,
		decision: 'approve' | 'deny',
	): Promise<{ status: EToolCallStatus; result?: string; threadId?: string }> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error('Tool call not found');
		if (tc.status !== EToolCallStatus.PENDING) throw new Error(`Tool call is ${tc.status}, not PENDING`);

		if (decision === 'deny') {
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.DENIED, resolvedAt: Date.now() });
			return { status: EToolCallStatus.DENIED };
		}

		await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });

		try {
			const args = JSON.parse(tc.arguments);
			const mcpResult = await this.mcpClient.executeToolCall(tc.serverName, tc.toolName, args);
			const resultStr = JSON.stringify(mcpResult.content);
			const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;

			await this.persistence.updateToolCall(toolCallId, {
				status: finalStatus,
				result: resultStr,
				error: mcpResult.isError ? resultStr : null,
				resolvedAt: Date.now(),
			});

			return { status: finalStatus, result: resultStr, threadId: tc.threadId };
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.ERROR, error: errorMsg, resolvedAt: Date.now() });
			throw err;
		}
	}

	// ============================================================
	// Helpers
	// ============================================================
	private write(res: Response, data: Record<string, unknown>): void {
		res.write(`data: ${JSON.stringify(data)}\n\n`);
	}

	private buildInferenceParams(params: Record<string, unknown>): Record<string, unknown> {
		const p = params as any;
		return {
			...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
			...(p.topP !== undefined ? { top_p: p.topP } : {}),
			...(p.maxTokens > 0 ? { max_tokens: p.maxTokens } : {}),
			...(p.frequencyPenalty ? { frequency_penalty: p.frequencyPenalty } : {}),
			...(p.presencePenalty ? { presence_penalty: p.presencePenalty } : {}),
			...(p.seed >= 0 ? { seed: p.seed } : {}),
			...(p.repeatPenalty !== 1.0 ? { repeat_penalty: p.repeatPenalty } : {}),
			...(p.minP > 0 ? { min_p: p.minP } : {}),
			...(p.mirostatMode > 0 ? { mirostat: p.mirostatMode, mirostat_tau: p.mirostatTau, mirostat_eta: p.mirostatEta } : {}),
			...(p.cachePrompt ? { cache_prompt: true } : {}),
			...(p.responseFormat && p.responseFormat !== 'text' ? { response_format: { type: p.responseFormat } } : {}),
			...(p.reasoningFormat && p.reasoningFormat !== 'none' ? { reasoning_format: p.reasoningFormat } : {}),
			...(p.enableThinking || (p.reasoningEffort && p.reasoningEffort !== 'none')
				? { chat_template_kwargs: {
					...(p.enableThinking ? { enable_thinking: true } : {}),
					...(p.reasoningEffort && p.reasoningEffort !== 'none' ? { reasoning_effort: p.reasoningEffort } : {}),
				} }
				: {}),
		};
	}
}
