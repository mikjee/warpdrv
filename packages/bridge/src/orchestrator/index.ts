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
import type { IMcpClient, IPermissions, IPersistence, IBridgeBroadcaster } from '../types/interfaces';
import type {
	ICompletionRequest,
	IToolDefinition,
	IToolCall,
	IOpenAITool,
	IChatMessageStats,
	IMessagePart,
	IChatMessage,
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
	broadcaster: IBridgeBroadcaster;
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
	private broadcaster: IBridgeBroadcaster;

	constructor(config: IOrchestratorConfig) {
		this.mcpClient = config.mcpClient;
		this.permissions = config.permissions;
		this.persistence = config.persistence;
		this.broadcaster = config.broadcaster;
	}

	async handleCompletion(
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		try {
			const allTools = this.mcpClient.getAllTools();
			const enabledTools = await this.permissions.getEnabledTools(allTools);

			// Auto-create thread if it doesn't exist
			let thread = await this.persistence.getThread(request.threadId);
			if (!thread) {
				const now = Date.now();
				thread = {
					id: request.threadId,
					title: 'New Chat',
					folderId: null,
					systemPrompt: '',
					meta: '{}',
					totalPromptTokens: 0,
					totalCompletionTokens: 0,
					createdAt: now,
					updatedAt: now,
				};
				await this.persistence.createThread(thread);
				this.broadcaster.emit({ type: 'thread.created', thread });
			}

			// Determine parent of new assistant message
			let parentForAssistant: string | null = request.parentId ?? null;

			// If userMessage content provided, bridge generates ID and saves
			if (request.userMessage) {
				const userMessageId = crypto.randomUUID();
				const userMsg: IChatMessage = {
					id: userMessageId,
					parentId: request.parentId ?? null,
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
				};
				await this.persistence.createMessage(userMsg);
				this.broadcaster.emit({ type: 'message.created', message: userMsg });
				parentForAssistant = userMessageId;
			}

			// Create the assistant message row
			const assistantMessageId = crypto.randomUUID();
			const assistantCreatedAt = Date.now();
			const assistantMsg: IChatMessage = {
				id: assistantMessageId,
				parentId: parentForAssistant,
				threadId: request.threadId,
				role: EChatRole.ASSISTANT,
				content: [],
				stats: null,
				createdAt: assistantCreatedAt,
			};
			await this.persistence.createMessage(assistantMsg);
			this.broadcaster.emit({ type: 'message.created', message: assistantMsg });

			const messages = request.systemPrompt
				? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages]
				: [...request.messages];

			const turn: ITurnState = {
				assistantMessageId,
				partOrderCounter: 0,
				currentTextPart: null,
				currentReasoningPart: null,
			};

			await this.runPass(inferenceUrl, messages, enabledTools, request, abortSignal, turn);
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (!abortSignal.aborted) {
				console.error('[Orchestrator] handleCompletion error:', errorMsg);
			}
		}
	}

	private async runPass(
		inferenceUrl: string,
		messages: Array<{ role: string; content: string; tool_calls?: unknown[]; tool_call_id?: string }>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
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
				console.error(`[Orchestrator] Inference error ${response.status}: ${errBody}`);
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
						// Broadcast incremental text update
						this.broadcaster.emit({
							type: 'message.patched',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							updates: {
								addParts: [{
									id: turn.currentTextPart.id,
									type: EMessagePartType.TEXT,
									orderIndex: turn.partOrderCounter,
									text: turn.currentTextPart.text,
								}],
							},
						});
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
						this.broadcaster.emit({
							type: 'message.patched',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							updates: {
								addParts: [{
									id: turn.currentReasoningPart.id,
									type: EMessagePartType.REASONING,
									orderIndex: turn.partOrderCounter,
									text: turn.currentReasoningPart.text,
								}],
							},
						});
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

			// Terminal — text response done
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
					this.broadcaster.emit({
						type: 'message.patched',
						messageId: turn.assistantMessageId,
						threadId: request.threadId,
						updates: { stats },
					});
				}
				return;
			}

			// Process each tool call: persist, create child tool message, execute or wait
			let needsAsk = false;
			const toolResults: Array<{ callId: string; name: string; result: string }> = [];
			for (const tc of finalToolCalls) {
				if (abortSignal.aborted) return;
				const serverName = this.mcpClient.findToolServer(tc.name);
				let args: Record<string, unknown> = {};
				try { args = JSON.parse(tc.arguments || '{}'); } catch { /* empty */ }

				let validationError: string | null = null;
				if (!serverName) {
					validationError = `No MCP server for tool '${tc.name}'`;
				} else {
					const toolDef = enabledTools.find(t => t.name === tc.name);
					if (toolDef) {
						const validation = validateToolArgs(toolDef.inputSchema, args);
						if (!validation.valid) {
							validationError = `Invalid arguments: ${validation.errors.join(', ')}`;
						}
					}
				}

				const toolCallId = crypto.randomUUID();
				const toolCallRecord: IToolCall = {
					id: toolCallId,
					messageId: turn.assistantMessageId,
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
				this.broadcaster.emit({ type: 'tool_call.created', toolCall: toolCallRecord });

				const toolPart: IMessagePart = {
					id: crypto.randomUUID(),
					type: EMessagePartType.TOOL_CALL,
					orderIndex: turn.partOrderCounter++,
					toolCallId,
				};
				await this.persistence.appendMessagePart(turn.assistantMessageId, toolPart);
				this.broadcaster.emit({
					type: 'message.patched',
					messageId: turn.assistantMessageId,
					threadId: request.threadId,
					updates: { addParts: [toolPart] },
				});

				if (validationError) {
					toolResults.push({ callId: tc.id, name: tc.name, result: toolCallRecord.result! });
					continue;
				}

				const approvalMode = await this.permissions.getToolApprovalMode(serverName!, tc.name);

				if (approvalMode === EToolApprovalMode.ASK) {
					needsAsk = true;
					continue;
				}

				if (approvalMode === EToolApprovalMode.DENIED) {
					const updatedTc: IToolCall = {
						...toolCallRecord,
						status: EToolCallStatus.DENIED,
						result: JSON.stringify({ error: 'Tool call denied by policy' }),
						resolvedAt: Date.now(),
					};
					await this.persistence.updateToolCall(toolCallId, { status: updatedTc.status, result: updatedTc.result, resolvedAt: updatedTc.resolvedAt });
					this.broadcaster.emit({ type: 'tool_call.updated', toolCall: updatedTc });
					toolResults.push({ callId: tc.id, name: tc.name, result: updatedTc.result! });
					continue;
				}

				// ALLOWED — execute
				const executingTc: IToolCall = { ...toolCallRecord, status: EToolCallStatus.EXECUTING };
				await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: executingTc });

				try {
					const mcpResult = await this.mcpClient.executeToolCall(serverName!, tc.name, args);
					const resultStr = JSON.stringify(mcpResult.content);
					const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;
					const completedTc: IToolCall = {
						...toolCallRecord,
						status: finalStatus,
						result: resultStr,
						error: mcpResult.isError ? resultStr : null,
						resolvedAt: Date.now(),
					};
					await this.persistence.updateToolCall(toolCallId, {
						status: finalStatus,
						result: resultStr,
						error: mcpResult.isError ? resultStr : null,
						resolvedAt: completedTc.resolvedAt,
					});
					this.broadcaster.emit({ type: 'tool_call.updated', toolCall: completedTc });
					toolResults.push({ callId: tc.id, name: tc.name, result: resultStr });
				} catch (err) {
					const errorMsg = err instanceof Error ? err.message : String(err);
					const errorResult = JSON.stringify({ error: errorMsg });
					const erroredTc: IToolCall = {
						...toolCallRecord,
						status: EToolCallStatus.ERROR,
						error: errorMsg,
						resolvedAt: Date.now(),
					};
					await this.persistence.updateToolCall(toolCallId, {
						status: EToolCallStatus.ERROR,
						error: errorMsg,
						resolvedAt: erroredTc.resolvedAt,
					});
					this.broadcaster.emit({ type: 'tool_call.updated', toolCall: erroredTc });
					toolResults.push({ callId: tc.id, name: tc.name, result: errorResult });
				}
			}

			if (needsAsk) return;

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

			for (const tr of toolResults) {
				conversationMessages.push({
					role: 'tool',
					content: tr.result,
					tool_call_id: tr.callId,
				} as any);
			}
			autoContinues++;
		}
		console.error(`[Orchestrator] Tool auto-execution exceeded ${MAX_AUTO_CONTINUES} iterations`);
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
	): Promise<{ status: EToolCallStatus; result?: string; threadId?: string }> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error('Tool call not found');
		if (tc.status !== EToolCallStatus.PENDING) throw new Error(`Tool call is ${tc.status}, not PENDING`);

		if (decision === 'deny') {
			const deniedTc: IToolCall = { ...tc, status: EToolCallStatus.DENIED, resolvedAt: Date.now() };
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.DENIED, resolvedAt: deniedTc.resolvedAt });
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: deniedTc });
			return { status: EToolCallStatus.DENIED };
		}

		const executingTc: IToolCall = { ...tc, status: EToolCallStatus.EXECUTING };
		await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.EXECUTING });
		this.broadcaster.emit({ type: 'tool_call.updated', toolCall: executingTc });

		try {
			const args = JSON.parse(tc.arguments);
			const mcpResult = await this.mcpClient.executeToolCall(tc.serverName, tc.toolName, args);
			const resultStr = JSON.stringify(mcpResult.content);
			const finalStatus = mcpResult.isError ? EToolCallStatus.ERROR : EToolCallStatus.COMPLETED;
			const completedTc: IToolCall = {
				...tc,
				status: finalStatus,
				result: resultStr,
				error: mcpResult.isError ? resultStr : null,
				resolvedAt: Date.now(),
			};
			await this.persistence.updateToolCall(toolCallId, {
				status: finalStatus,
				result: resultStr,
				error: mcpResult.isError ? resultStr : null,
				resolvedAt: completedTc.resolvedAt,
			});
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: completedTc });
			return { status: finalStatus, result: resultStr, threadId: tc.threadId };
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			const erroredTc: IToolCall = { ...tc, status: EToolCallStatus.ERROR, error: errorMsg, resolvedAt: Date.now() };
			await this.persistence.updateToolCall(toolCallId, { status: EToolCallStatus.ERROR, error: errorMsg, resolvedAt: erroredTc.resolvedAt });
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: erroredTc });
			throw err;
		}
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