// ============================================================
// warpbridge/src/orchestrator/index.ts
//
// Each inference pass produces ONE assistant message. If the model
// emits tool calls, they finish (auto-execute or wait for approval),
// and a NEW assistant message is created as a child of the last tool
// message for the next pass. No appending across tool boundaries.
//
// All state changes emit events via the broadcaster. No direct SSE.
// ============================================================
import crypto from 'crypto';
import type { IMcpClient, IPermissions, IPersistence, IBridgeBroadcaster } from '../types/interfaces';
import type {
	ICompletionRequest,
	IToolDefinition,
	IToolCall,
	IOpenAITool,
	IChatMessageStats,
	IChatMessage,
	IMessagePart,
	TMessageId,
	TThreadId,
} from '../types';
import { EChatRole, EMessagePartType, EToolCallStatus, EToolApprovalMode } from '../types';
import { parseSSEBuffer, accumulateToolCallDelta, finalizeToolCalls, type IToolCallAccumulator } from '../parser';
import { validateToolArgs, cleanSchema } from '../validation';

const MAX_PASSES = 10;

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

interface IPassResult {
	hadToolCalls: boolean;
	needsAsk: boolean;
	lastToolMessageId: TMessageId | null;
}

// Track in-flight inference URLs per thread so resume can continue
const threadInferenceUrls: Map<TThreadId, string> = new Map();

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
			// Auto-create thread if needed
			let thread = await this.persistence.getThread(request.threadId);
			let isNewThread: boolean = false;
			if (!thread) {
				isNewThread = true;
				const now = Date.now();
				let title = 'New Chat';
				if (request.userMessage) {
					title = this.truncateTitle(request.userMessage.content);
				}
				thread = {
					id: request.threadId,
					title,
					folderId: null,
					systemPrompt: '',
					meta: JSON.stringify({ serverId: request.serverId ?? null, tags: [] }),
					totalPromptTokens: 0,
					totalCompletionTokens: 0,
					createdAt: now,
					updatedAt: now,
				};
				await this.persistence.createThread(thread);
				await this.persistence.setThreadConfig({
					threadId: request.threadId,
					presetId: request.presetId ?? null,
					systemPrompt: request.systemPrompt ?? '',
					params: JSON.stringify(request.inferenceParams ?? {}),
				});
				this.broadcaster.emit({ type: 'thread.created', thread });
			}

			// Stash inference URL for post-approval resume
			threadInferenceUrls.set(request.threadId, inferenceUrl);

			// Determine parent for the first assistant message
			let parentForAssistant: string | null = request.parentId ?? null;

			// If userMessage content provided, bridge generates ID and saves
			if (request.userMessage) {
				const userMessageId = crypto.randomUUID();
				const content: IMessagePart[] = [{
					id: crypto.randomUUID(),
					type: EMessagePartType.TEXT,
					orderIndex: 0,
					text: request.userMessage.content,
				}];
				
				if (request.attachments?.length) {
					for (const att of request.attachments) {
						content.push({
							id: crypto.randomUUID(),
							type: EMessagePartType.ATTACHMENT,
							orderIndex: content.length,
							data: att.data,
							mimeType: att.mimeType,
							fileName: att.fileName,
							fileSize: att.fileSize,
						});
					}
				}
				
				const userActualTokens = content.reduce((acc, p) => {
					if (p.type === EMessagePartType.TEXT || p.type === EMessagePartType.REASONING) return acc + (p.text ?? '').length;
					if (p.type === EMessagePartType.ATTACHMENT) return acc + (p.data?.length ?? 0);
					return acc;
				}, 0);
				const userMsg: IChatMessage = {
					id: userMessageId,
					parentId: request.parentId ?? null,
					threadId: request.threadId,
					role: EChatRole.USER,
					content,
					stats: { promptTokens: 0, completionTokens: 0, reasoningTokens: 0, actualTokens: Math.ceil(userActualTokens / 4) },
					createdAt: Date.now(),
				};
				await this.persistence.createMessage(userMsg);
				await this.persistence.incrementThreadTokens(request.threadId, userMsg.stats!.actualTokens ?? 0, 0);
				this.broadcaster.emit({ type: 'message.created', message: userMsg });
				parentForAssistant = userMessageId;
			}

			const enabledTools = await this.permissions.getEnabledTools(this.mcpClient.getAllTools());
			
			// Build base messages for LLM context
			let baseMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];
			
			// Add system prompt if provided
			if (request.systemPrompt) {
				baseMessages.push({ role: 'system', content: request.systemPrompt });
			}
			
			// Add conversation history
			baseMessages.push(...(request.messages as any[]));
			
			// Add the new user message if provided (critical for first message)
			if (request.userMessage) {
				const text = request.userMessage.content;
				const newAttachments = request.attachments ?? [];
				
				if (newAttachments.length > 0) {
					// Build multimodal content: text + image_url for each attachment
					const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
					if (text) contentParts.push({ type: 'text', text });
					for (const att of newAttachments) {
						const base64 = att.data.startsWith('data:') ? att.data.split(',')[1] : att.data;
						contentParts.push({
							type: 'image_url',
							image_url: { url: `data:${att.mimeType};base64,${base64}` },
						});
					}
					baseMessages.push({ role: 'user', content: contentParts });
				} else {
					baseMessages.push({ role: 'user', content: text });
				}
			}

			await this.executePass(
				inferenceUrl,
				request,
				parentForAssistant,
				baseMessages,
				enabledTools,
				abortSignal,
			);

			// Fire title generation after response completes (fire-and-forget)
			if (request.userMessage && !!request.generateTitle && isNewThread) {
				this.generateTitle(inferenceUrl, request.userMessage.content)
					.then(title => {
						this.persistence.updateThread(request.threadId, { title });
						this.broadcaster.emit({ type: 'thread.updated', threadId: request.threadId, updates: { title } });
					})
					.catch(() => {
						// Title generation failed, keep truncated title
					});
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (abortSignal.aborted) {
				this.broadcaster.emit({
					type: 'inference.ended',
					threadId: request.threadId,
					messageId: request.parentId ?? crypto.randomUUID(),
				});
			} else {
				console.error('[Orchestrator] handleCompletion error:', errorMsg);
				this.broadcaster.emit({
					type: 'inference.error',
					threadId: request.threadId,
					messageId: request.parentId ?? crypto.randomUUID(),
					error: errorMsg,
				});
			}
		}
	}

	// Execute one inference pass: create assistant message, run inference,
	// emit lifecycle events, and recursively trigger the next pass if tool
	// calls auto-resolved. Does NOT loop.
	private async executePass(
		inferenceUrl: string,
		request: ICompletionRequest,
		parentId: TMessageId | null,
		messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
		enabledTools: IToolDefinition[],
		abortSignal: AbortSignal,
	): Promise<void> {
		if (abortSignal.aborted) return;

		// Create new assistant message for this pass
		const assistantMsg = await this.createAssistantMessage(request.threadId, parentId);
		const turn: ITurnState = {
			assistantMessageId: assistantMsg.id,
			partOrderCounter: 0,
			currentTextPart: null,
			currentReasoningPart: null,
		};

		this.broadcaster.emit({
			type: 'inference.started',
			threadId: request.threadId,
			messageId: assistantMsg.id,
		});

		let result: IPassResult | null = null;
		try {
			result = await this.runPass(
				inferenceUrl,
				messages,
				enabledTools,
				request,
				abortSignal,
				turn,
			);
		} finally {
			// Final checkpoint patch with full message state, then inference.ended
			const finalMessage = await this.persistence.getMessage(assistantMsg.id);
			if (finalMessage) {
				this.broadcaster.emit({
					type: 'message.patched',
					messageId: assistantMsg.id,
					threadId: request.threadId,
					updates: {
						stats: finalMessage.stats ?? undefined,
						replaceParts: finalMessage.content,
					},
				});
			}
			this.broadcaster.emit({
				type: 'inference.ended',
				threadId: request.threadId,
				messageId: assistantMsg.id,
			});
		}

		// Stop conditions: waiting for approval, or no tool calls fired
		if (!result) return;
		if (result.needsAsk) return;
		if (!result.hadToolCalls) return;

		// Tool calls auto-resolved — trigger next pass with new assistant message
		// child of the last tool message. Recursive, not iterative.
		await this.executePass(
			inferenceUrl,
			request,
			result.lastToolMessageId,
			messages,
			enabledTools,
			abortSignal,
		);
	}

	private async createAssistantMessage(threadId: TThreadId, parentId: TMessageId | null): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: crypto.randomUUID(),
			parentId,
			threadId,
			role: EChatRole.ASSISTANT,
			content: [],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: 'message.created', message: msg });
		return msg;
	}

	private async createToolMessage(threadId: TThreadId, parentId: TMessageId, toolCallId: string): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: crypto.randomUUID(),
			parentId,
			threadId,
			role: EChatRole.TOOL,
			content: [{
				id: crypto.randomUUID(),
				type: EMessagePartType.TOOL_CALL,
				orderIndex: 0,
				toolCallId,
			}],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: 'message.created', message: msg });
		return msg;
	}

	// Single inference pass. Streams to llama-server, persists parts,
	// emits chunk and patch events. Returns whether tool calls fired.
	private async runPass(
		inferenceUrl: string,
		messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
		abortSignal: AbortSignal,
		turn: ITurnState,
	): Promise<IPassResult> {
		const openAiTools: IOpenAITool[] = enabledTools.map(t => ({
			type: 'function' as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: cleanSchema(t.inputSchema),
			},
		}));
		const hasTools = openAiTools.length > 0;

		const body: Record<string, unknown> = {
			model: 'model',
			messages: messages,
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
			const errorMessage = `Inference error ${response.status}: ${errBody}`;
			console.error(`[Orchestrator] ${errorMessage}`);
			this.broadcaster.emit({
				type: 'inference.error',
				threadId: request.threadId,
				messageId: turn.assistantMessageId,
				error: errorMessage,
			});
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
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
		let streamError: string | null = null;

		try {
			while (true) {
				const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const { chunks, remaining } = parseSSEBuffer(buffer);
			buffer = remaining;

			for (const chunk of chunks) {
				if (abortSignal.aborted) {
					await this.flushReasoningPart(turn);
					await this.flushTextPart(turn);
					return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
				}
				if (chunk.error || chunk.warpcore_event === 'error') {
					streamError = chunk.error ?? 'Inference error from server';
					break;
				}
				const delta = chunk.choices?.[0]?.delta;

				if (delta?.content) {
					fullText += delta.content;
					if (turn.currentReasoningPart) { await this.flushReasoningPart(turn); }
					if (!turn.currentTextPart) {
						turn.currentTextPart = { id: crypto.randomUUID(), text: '' };
						this.broadcaster.emit({
							type: 'message.patched',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							updates: {
								addParts: [{
									id: turn.currentTextPart.id,
									type: EMessagePartType.TEXT,
									orderIndex: turn.partOrderCounter,
									text: '',
								}],
							},
						});
					}
					turn.currentTextPart.text += delta.content;
					this.broadcaster.emit({
						type: 'message.chunk',
						messageId: turn.assistantMessageId,
						threadId: request.threadId,
						partId: turn.currentTextPart.id,
						partType: EMessagePartType.TEXT,
						deltaText: delta.content,
					});
				}

				if (delta?.reasoning_content) {
					reasoningText += delta.reasoning_content;
					if (turn.currentTextPart) { await this.flushTextPart(turn); }
					if (!turn.currentReasoningPart) {
						turn.currentReasoningPart = { id: crypto.randomUUID(), text: '' };
						this.broadcaster.emit({
							type: 'message.patched',
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							updates: {
								addParts: [{
									id: turn.currentReasoningPart.id,
									type: EMessagePartType.REASONING,
									orderIndex: turn.partOrderCounter,
									text: '',
								}],
							},
						});
					}
					turn.currentReasoningPart.text += delta.reasoning_content;
					this.broadcaster.emit({
						type: 'message.chunk',
						messageId: turn.assistantMessageId,
						threadId: request.threadId,
						partId: turn.currentReasoningPart.id,
						partType: EMessagePartType.REASONING,
						deltaText: delta.reasoning_content,
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
		} finally {
			await this.flushReasoningPart(turn);
			await this.flushTextPart(turn);
		}

		await this.flushReasoningPart(turn);
		await this.flushTextPart(turn);

		if (streamError) {
			this.broadcaster.emit({
				type: 'inference.error',
				threadId: request.threadId,
				messageId: turn.assistantMessageId,
				error: streamError,
			});
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		const finalToolCalls = finalizeToolCalls(toolCallAccumulators);

		if (timings || usage) {
			const actualTokens = Math.ceil((fullText.length + reasoningText.length) / 4);
			const stats: IChatMessageStats = {
				promptTokens: (usage?.prompt_tokens ?? timings?.prompt_n ?? 0),
				completionTokens: (usage?.completion_tokens ?? timings?.predicted_n ?? 0),
				reasoningTokens: (usage?.reasoning_tokens ?? 0),
				actualTokens,
				promptPerSecond: timings?.prompt_per_second ?? 0,
				predictedPerSecond: timings?.predicted_per_second ?? 0,
				promptMs: timings?.prompt_ms ?? 0,
				predictedMs: timings?.predicted_ms ?? 0,
			};
			await this.persistence.updateMessage(turn.assistantMessageId, { stats });
			this.broadcaster.emit({
				type: 'message.patched',
				messageId: turn.assistantMessageId,
				threadId: request.threadId,
				updates: { stats },
			});
			await this.persistence.incrementThreadTokens(
				request.threadId,
				0,
				stats.actualTokens ?? 0,
			);
		}

		if (finalToolCalls.length === 0 || finishReason !== 'tool_calls') {
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		// Process tool calls — chain tool messages linearly off the assistant
		let needsAsk = false;
		let lastToolMessageId: TMessageId | null = null;
		let previousToolMessageId: TMessageId = turn.assistantMessageId;

		messages.push({
			role: 'assistant',
			content: fullText || (null as any),
			tool_calls: finalToolCalls.map(tc => ({
				id: tc.id,
				type: 'function',
				function: { name: tc.name, arguments: tc.arguments },
			})),
		} as any);

		for (const tc of finalToolCalls) {
			if (abortSignal.aborted) return { hadToolCalls: true, needsAsk: false, lastToolMessageId };

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

			// Pre-generate IDs so writes happen in the correct event order
			const toolCallId = crypto.randomUUID();
			const toolMessageId = crypto.randomUUID();

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

			// Order: tool_call.created -> message.patched (assistant gets tool_call part) -> message.created (tool message)
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

			// Tool message chained off previous tool message (or assistant for first)
			const toolMsg: IChatMessage = {
				id: toolMessageId,
				parentId: previousToolMessageId,
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
			};
			await this.persistence.createMessage(toolMsg);
			this.broadcaster.emit({ type: 'message.created', message: toolMsg });

			previousToolMessageId = toolMessageId;
			lastToolMessageId = toolMessageId;

			if (validationError) {
				messages.push({
					role: 'tool',
					content: toolCallRecord.result!,
					tool_call_id: tc.id,
				} as any);
				continue;
			}

			const approvalMode = await this.permissions.getToolApprovalMode(serverName!, tc.name);

			if (approvalMode === EToolApprovalMode.ASK) {
				needsAsk = true;
				continue;
			}

			if (approvalMode === EToolApprovalMode.DENIED) {
				const deniedTc: IToolCall = {
					...toolCallRecord,
					status: EToolCallStatus.DENIED,
					result: JSON.stringify({ error: 'Tool call denied by policy' }),
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: deniedTc.status,
					result: deniedTc.result,
					resolvedAt: deniedTc.resolvedAt,
				});
				this.broadcaster.emit({ type: 'tool_call.updated', toolCall: deniedTc });
				messages.push({
					role: 'tool',
					content: deniedTc.result!,
					tool_call_id: tc.id,
				} as any);
				continue;
			}

			// ALLOWED — execute now
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
				messages.push({
					role: 'tool',
					content: resultStr,
					tool_call_id: tc.id,
				} as any);
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
				messages.push({
					role: 'tool',
					content: errorResult,
					tool_call_id: tc.id,
				} as any);
			}
		}

		return { hadToolCalls: true, needsAsk, lastToolMessageId };
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

	// Resume after user approval/denial. Updates tool call, then auto-triggers
	// the next inference pass with a new assistant message.
	async resumeToolCall(
		toolCallId: string,
		decision: 'approve' | 'deny',
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error('Tool call not found');
		if (tc.status !== EToolCallStatus.PENDING) throw new Error(`Tool call is ${tc.status}, not PENDING`);

		if (decision === 'deny') {
			const deniedTc: IToolCall = {
				...tc,
				status: EToolCallStatus.DENIED,
				result: JSON.stringify({ error: 'Tool call denied by user' }),
				resolvedAt: Date.now(),
			};
			await this.persistence.updateToolCall(toolCallId, {
				status: deniedTc.status,
				result: deniedTc.result,
				resolvedAt: deniedTc.resolvedAt,
			});
			this.broadcaster.emit({ type: 'tool_call.updated', toolCall: deniedTc });
		} else {
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
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : String(err);
				const erroredTc: IToolCall = {
					...tc,
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
			}
		}

		// Check if any other tool calls in the same parent assistant message
		// are still pending. If so, wait for them too.
		// Walk up the tool message chain from the just-resolved tool call,
		// collecting all sibling tool messages until we hit the assistant.
		// Then check if any of those tool calls are still pending/executing.
		const chainToolCallIds: string[] = [];
		let cursorId: TMessageId | null = tc.messageId;
		while (cursorId) {
			const cursorMsg = await this.persistence.getMessage(cursorId);
			if (!cursorMsg || cursorMsg.role !== EChatRole.TOOL) break;
			// Find the tool_call referenced by this tool message's content
			const toolCallPart = cursorMsg.content.find(p => p.type === EMessagePartType.TOOL_CALL);
			if (toolCallPart && 'toolCallId' in toolCallPart) {
				chainToolCallIds.push(toolCallPart.toolCallId);
			}
			cursorId = cursorMsg.parentId;
		}

		const allInChain = await Promise.all(
			chainToolCallIds.map(id => this.persistence.getToolCall(id))
		);
		const stillBlocking = allInChain.some(t =>
			t && (t.status === EToolCallStatus.PENDING || t.status === EToolCallStatus.EXECUTING || t.status === EToolCallStatus.DENIED)
		);
		if (stillBlocking) return;

		// Convert resolved tool calls to OpenAI format and append to messages
		const toolOpenAIMessages = allInChain
			.filter((tc): tc is IToolCall => tc !== null)
			.map(tc => ({
				role: 'tool' as const,
				content: tc.result ?? JSON.stringify({ error: tc.error }),
				tool_call_id: tc.id,
			}));

		// All tool calls resolved — trigger next inference pass
		// Rebuild conversation context from thread history
		const enabledTools = await this.permissions.getEnabledTools(this.mcpClient.getAllTools());
		const baseMessages = request.systemPrompt
			? [{ role: 'system' as const, content: request.systemPrompt }, ...request.messages, ...toolOpenAIMessages]
			: [...request.messages, ...toolOpenAIMessages];

		await this.executePass(
			inferenceUrl,
			request,
			tc.messageId,
			baseMessages,
			enabledTools,
			abortSignal,
		);
	}

	private buildInferenceParams(params: Record<string, unknown>): Record<string, unknown> {
		const p = params as any;
		return {
			...(p.temperature !== undefined ? { temperature: p.temperature } : {}),
			...(p.topP !== undefined ? { top_p: p.topP } : {}),
			...(p.topK !== undefined ? { top_k: p.topK } : {}),
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
			...(p.enableThinking !== undefined || p.reasoningEffort !== undefined
				? { chat_template_kwargs: {
					...(p.enableThinking !== undefined ? { enable_thinking: p.enableThinking } : {}),
					...(p.reasoningEffort !== undefined ? { reasoning_effort: p.reasoningEffort } : {}),
				} }
				: {}),
			...(p.typicalP !== undefined ? { typical_p: p.typicalP } : {}),
			...(p.ignoreEos !== undefined ? { ignore_eos: p.ignoreEos } : {}),
			...(p.logitBias && p.logitBias.length ? { logit_bias: p.logitBias } : {}),
			...(p.dryMultiplier ? { dry_multiplier: p.dryMultiplier } : {}),
			...(p.dryBase ? { dry_base: p.dryBase } : {}),
			...(p.dryAllowedLength ? { dry_allowed_length: p.dryAllowedLength } : {}),
			...(p.dryPenaltyLastN ? { dry_penalty_last_n: p.dryPenaltyLastN } : {}),
			...(p.topNSigma !== undefined ? { top_n_sigma: p.topNSigma } : {}),
			...(p.xtcProbability ? { xtc_probability: p.xtcProbability } : {}),
			...(p.xtcThreshold ? { xtc_threshold: p.xtcThreshold } : {}),
			...(p.dynatempRange ? { dynatemp_range: p.dynatempRange } : {}),
			...(p.dynatempExponent ? { dynatemp_exponent: p.dynatempExponent } : {}),
			...(p.repeatLastN !== undefined ? { repeat_last_n: p.repeatLastN } : {}),
			...(p.n_probs !== undefined ? { n_probs: p.n_probs } : {}),
			...(p.samplers && p.samplers.length ? { samplers: p.samplers } : {}),
			...(p.grammar ? { grammar: p.grammar } : {}),
			...(p.jsonSchema ? { json_schema: p.jsonSchema } : {}),
			...(p.adaptiveTarget ? { adaptive_target: p.adaptiveTarget } : {}),
			...(p.adaptiveDecay ? { adaptive_decay: p.adaptiveDecay } : {}),
			...(p.extraSamplingParams ? { ...p.extraSamplingParams } : {}),
			...(p.stopSequences && p.stopSequences.length ? { stop: p.stopSequences } : {}),
		};
	}

	private generateTitle(inferenceUrl: string, userContent: string): Promise<string> {
		return fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer warpcore' },
			body: JSON.stringify({
				model: 'model',
				messages: [
					{ role: 'user', content: 'Generate a concise 3-5 word title for the conversation below. Return ONLY the title text, no quotes, no explanation.\n\n' + userContent },
				],
				stream: false,
				max_tokens: 30,
				temperature: 0.3,
				chat_template_kwargs: { enable_thinking: false },
			}),
		})
			.then(res => {
				if (!res.ok || !res.body) throw new Error('Title generation failed');
				return res.json();
			})
			.then(body => {
				const title = body?.choices?.[0]?.message?.content ?? '';
				if (!title) throw new Error('Empty title response');
				return title.replace(/^["']|["']$/g, '').trim();
			});
	}

	private truncateTitle(text: string): string {
		const words = text.split(/\s+/).filter(Boolean).slice(0, 5);
		return words.join(' ') || 'New Chat';
	}
}