// ============================================================
// warpbridge/src/orchestrator/index.ts
// Core inference orchestrator.
//
// Persistence model:
// - Assistant messages contain text/reasoning parts AND tool_call parts (references)
// - Tool messages are separate rows (role: TOOL), one per tool execution
//   - parentId points at the assistant message that requested it
//   - Single content part of type TOOL_CALL referencing the same tool_calls row
// - tool_calls table has the metadata (server, args, result, status, etc.)
//
// Wire format to llama-server:
// - Assistant entries get a synthesized tool_calls field built from their tool_call parts
// - Tool messages become {role: 'tool', tool_call_id, content} entries
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
import { EChatRole, EMessagePartType, EToolCallStatus, EToolApprovalMode } from '../types';
import { parseSSEBuffer, accumulateToolCallDelta, finalizeToolCalls, type IToolCallAccumulator } from '../parser';
import { validateToolArgs, cleanSchema } from '../validation';

const MAX_AUTO_CONTINUES = 10;

export interface IOrchestratorConfig {
	mcpClient: IMcpClient;
	permissions: IPermissions;
	persistence: IPersistence;
	onMcpServersChanged?: (servers: Record<string, unknown>) => void;
}

interface ITurnState {
	assistantMessageId: TMessageId;
	partOrderCounter: number;
	currentTextPart: { id: string; text: string } | null;
	currentReasoningPart: { id: string; text: string } | null;
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

			// Determine parent of new assistant message
			let parentForAssistant: string | null = null;

			if (request.userMessage) {
				// New turn — save user message, assistant becomes its child
				const existing = await this.persistence.getMessage(request.userMessage.id);
				if (!existing) {
					await this.persistence.createMessage({
						id: request.userMessage.id,
						parentId: request.userMessage.parentId ?? null,
						threadId: request.threadId,
						role: EChatRole.USER,
						content: [{
							id: crypto.randomUUID(),
							type: EMessagePartType.TEXT,
							orderIndex: 0,
							text: request.userMessage.content,
						}],
						stats: null,
						createdAt: Date.now(),
					});
				}
				parentForAssistant = request.userMessage.id;
			} else {
				// No userMessage — explicit parentId from request (regen, continue, post-tool)
				parentForAssistant = request.parentId ?? null;
			}

			// Create the assistant message row
			const assistantMessageId = crypto.randomUUID();
			const assistantCreatedAt = Date.now();
			await this.persistence.createMessage({
				id: assistantMessageId,
				parentId: parentForAssistant,
				threadId: request.threadId,
				role: EChatRole.ASSISTANT,
				content: [],
				stats: null,
				createdAt: assistantCreatedAt,
			});

			this.write(res, {
				warpcore_event: 'assistant_message_created',
				message_id: assistantMessageId,
				parent_id: parentForAssistant,
				created_at: assistantCreatedAt,
			});

			const messages = request.systemPrompt
				? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages]
				: [...request.messages];

			const turn: ITurnState = {
				assistantMessageId,
				partOrderCounter: 0,
				currentTextPart: null,
				currentReasoningPart: null,
			};

			await this.runPass(inferenceUrl, messages, enabledTools, request, res, abortSignal, turn);
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

	private async runPass(
		inferenceUrl: string,
		messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
		res: Response,
		abortSignal: AbortSignal,
		turn: ITurnState,
	): Promise<void> {
		let conversationMessages = [...messages];
		let autoContinues = 0;

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

			const body: Record<string, unknown> = {
				model: 'model',
				messages: conversationMessages,
				stream: true,
				...(hasTools ? { tools: openAiTools } : {}),
				...this.buildInferenceParams(request.inferenceParams),
			};

			const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer warpcore' },
				body: JSON.stringify(body),
				signal: abortSignal,
			});

			if (!response.ok || !response.body) {
				const errBody = await response.text().catch(() => '');
				this.write(res, { warpcore_event: 'error', error: `Inference error ${response.status}: ${errBody}` });
				return;
			}

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
					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						fullText += delta.content;
						if (turn.currentReasoningPart) {
							await this.flushReasoningPart(turn);
						}
						if (!turn.currentTextPart) {
							turn.currentTextPart = { id: crypto.randomUUID(), text: '' };
						}
						turn.currentTextPart.text += delta.content;
						this.write(res, { choices: [{ index: 0, delta: { content: delta.content } }] });
					}

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						if (turn.currentTextPart) {
							await this.flushTextPart(turn);
						}
						if (!turn.currentReasoningPart) {
							turn.currentReasoningPart = { id: crypto.randomUUID(), text: '' };
						}
						turn.currentReasoningPart.text += delta.reasoning_content;
						this.write(res, { choices: [{ index: 0, delta: { reasoning_content: delta.reasoning_content } }] });
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							accumulateToolCallDelta(toolCallAccumulators, tc);
						}
					}

					const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) finishReason = fr;
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}

			// Flush in-progress text/reasoning parts
			await this.flushReasoningPart(turn);
			await this.flushTextPart(turn);

			const finalToolCalls = finalizeToolCalls(toolCallAccumulators);

			// Terminal — text response done, no tool calls
			if (finalToolCalls.length === 0 || finishReason !== 'tool_calls') {
				if (timings || usage) {
					const stats: IChatMessageStats = {
						promptTokens: (usage?.prompt_tokens ?? timings?.prompt_n ?? 0),
						completionTokens: (usage?.completion_tokens ?? timings?.predicted_n ?? 0),
						reasoningTokens: (usage?.reasoning_tokens ?? 0),
						promptPerSecond: timings?.prompt_per_second ?? 0,
						predictedPerSecond: timings?.predicted_per_second ?? 0,
						promptMs: timings?.prompt_ms ?? 0,
						predictedMs: timings?.predicted_ms ?? 0,
					};
					await this.persistence.updateMessage(turn.assistantMessageId, { stats });
					await this.persistence.incrementThreadTokens(
						request.threadId,
						stats.promptTokens,
						stats.completionTokens,
					);
				}
				this.write(res, {
					choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
					...(timings ? { timings } : {}),
					...(usage ? { usage } : {}),
				});
				return;
			}

			// Tool calls — emit each in OpenAI format to client
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

			// Process each tool call: persist, create child tool message, execute or wait
			let needsAsk = false;
			const completedToolMessages: Array<{ toolMessageId: string; callId: string; result: string }> = [];

			for (const tc of finalToolCalls) {
				if (abortSignal.aborted) return;

				const serverName = this.mcpClient.findToolServer(tc.name);
				const toolCallId = crypto.randomUUID();

				let args: Record<string, unknown> = {};
				try { args = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }

				// Validate args if we have a tool def
				let validationError: string | null = null;
				if (serverName) {
					const toolDef = enabledTools.find(t => t.name === tc.name);
					if (toolDef) {
						const validation = validateToolArgs(toolDef.inputSchema, args);
						if (!validation.valid) {
							validationError = `Invalid arguments: ${validation.errors.join(', ')}`;
						}
					}
				} else {
					validationError = `No MCP server for tool '${tc.name}'`;
				}

				// Add a tool_call part to the assistant message (the request side)
				await this.persistence.appendMessagePart(turn.assistantMessageId, {
					id: crypto.randomUUID(),
					type: EMessagePartType.TOOL_CALL,
					orderIndex: turn.partOrderCounter++,
					toolCallId,
				});

				// Create the child tool message — this represents the execution/result
				const toolMessageId = crypto.randomUUID();
				await this.persistence.createMessage({
					id: toolMessageId,
					parentId: turn.assistantMessageId,
					threadId: request.threadId,
					role: EChatRole.TOOL,
					content: [{
						id: crypto.randomUUID(),
						type: EMessagePartType.TOOL_CALL,
						orderIndex: 0,
						toolCallId,
					}],
					stats: null,
					createdAt: Date.now(),
				});

				// Persist the tool call row, pointing at the tool message
				const toolCallRecord: IToolCall = {
					id: toolCallId,
					messageId: toolMessageId,
					threadId: request.threadId,
					serverName: serverName ?? '',
					toolName: tc.name,
					arguments: JSON.stringify(args),
					result: validationError ? JSON.stringify({ error: validationError }) : null,
					status: validationError ? EToolCallStatus.ERROR : EToolCallStatus.PENDING,
					error: validationError,
					createdAt: Date.now(),
					resolvedAt: validationError ? Date.now() : null,
				};
				await this.persistence.createToolCall(toolCallRecord);

				if (validationError) {
					completedToolMessages.push({ toolMessageId, callId: tc.id, result: toolCallRecord.result! });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: EToolCallStatus.ERROR, result: toolCallRecord.result });
					continue;
				}

				const approvalMode = await this.permissions.getToolApprovalMode(serverName!, tc.name);

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

				if (approvalMode === EToolApprovalMode.DENIED) {
					await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.DENIED, resolvedAt: Date.now() });
					const deniedResult = JSON.stringify({ error: 'Tool call denied by policy' });
					completedToolMessages.push({ toolMessageId, callId: tc.id, result: deniedResult });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: EToolCallStatus.DENIED, result: deniedResult });
					continue;
				}

				// ALLOWED — execute now
				await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
				this.write(res, { warpcore_event: 'tool_call_executing', tool_call_id: toolCallId });

				try {
					const mcpResult = await this.mcpClient.executeToolCall(serverName!, tc.name, args);
					const resultStr = JSON.stringify(mcpResult.content);
					const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;
					await this.persistence.updateToolCall(toolCallId, {
						status: finalStatus,
						result: resultStr,
						error: mcpResult.isError ? resultStr : null,
						resolvedAt: Date.now(),
					});
					completedToolMessages.push({ toolMessageId, callId: tc.id, result: resultStr });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: finalStatus, result: resultStr });
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					const errorResult = JSON.stringify({ error: errorMsg });
					await this.persistence.updateToolCall(toolCallId, {
						status: EToolCallStatus.ERROR,
						error: errorMsg,
						resolvedAt: Date.now(),
					});
					completedToolMessages.push({ toolMessageId, callId: tc.id, result: errorResult });
					this.write(res, { warpcore_event: 'tool_call_result', tool_call_id: toolCallId, status: EToolCallStatus.ERROR, result: errorResult });
				}
			}

			if (needsAsk) {
				// Stop here — frontend will resume after approvals via a separate completions request
				this.write(res, { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
				return;
			}

			// Build wire-format context for next inference pass
			conversationMessages.push({
				role: 'assistant',
				content: fullText || (null as any),
				tool_calls: finalToolCalls.map(tc => ({
					id: tc.id,
					type: 'function',
					function: { name: tc.name, arguments: tc.arguments },
				})),
			} as any);

			for (const ctm of completedToolMessages) {
				conversationMessages.push({
					role: 'tool',
					content: ctm.result,
					tool_call_id: ctm.callId,
				} as any);
			}

			autoContinues++;
		}

		this.write(res, { warpcore_event: 'error', error: `Tool auto-execution exceeded ${MAX_AUTO_CONTINUES} iterations` });
	}

	private async flushTextPart(turn: ITurnState): Promise<void> {
		if (!turn.currentTextPart || !turn.currentTextPart.text) return;
		await this.persistence.appendMessagePart(turn.assistantMessageId, {
			id: turn.currentTextPart.id,
			type: EMessagePartType.TEXT,
			orderIndex: turn.partOrderCounter++,
			text: turn.currentTextPart.text,
		});
		turn.currentTextPart = null;
	}

	private async flushReasoningPart(turn: ITurnState): Promise<void> {
		if (!turn.currentReasoningPart || !turn.currentReasoningPart.text) return;
		await this.persistence.appendMessagePart(turn.assistantMessageId, {
			id: turn.currentReasoningPart.id,
			type: EMessagePartType.REASONING,
			orderIndex: turn.partOrderCounter++,
			text: turn.currentReasoningPart.text,
		});
		turn.currentReasoningPart = null;
	}

	async resumeToolCall(
		toolCallId: string,
		decision: 'approve' | 'deny',
	): Promise<{ status: EToolCallStatus; result?: string; threadId?: string; toolMessageId?: string }> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error('Tool call not found');
		if (tc.status !== EToolCallStatus.PENDING) throw new Error(`Tool call is ${tc.status}, not PENDING`);

		if (decision === 'deny') {
			await this.persistence.updateToolCall(toolCallId, {
				status: EToolCallStatus.DENIED,
				resolvedAt: Date.now(),
			});
			return { status: EToolCallStatus.DENIED, threadId: tc.threadId, toolMessageId: tc.messageId };
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
			return { status: finalStatus, result: resultStr, threadId: tc.threadId, toolMessageId: tc.messageId };
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			await this.persistence.updateToolCall(toolCallId, {
				status: EToolCallStatus.ERROR,
				error: errorMsg,
				resolvedAt: Date.now(),
			});
			throw err;
		}
	}

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