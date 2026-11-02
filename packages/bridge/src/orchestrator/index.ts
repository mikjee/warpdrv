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

import type { EventNode } from "@warpcore/realmcore";
import {
	genMessageId,
	genPartId,
	stableStringify,
	EThreadInferenceEndCause,
} from "@warpcore/shared";
import { isDeepStrictEqual } from "util";
import { convertMessagesToOpenAIFormat, type TOpenAIMessage } from "../messageConverter";
import {
	accumulateToolCallDelta,
	finalizeToolCalls,
	type IToolCallAccumulator,
	parseSSEBuffer,
} from "../parser";
import type {
	IChatMessage,
	IChatMessageStats,
	ICompletionRequest,
	IMessagePart,
	IMessagePartToolCall,
	IOpenAITool,
	IToolCall,
	IToolDefinition,
	TFolderId,
	TMessageId,
	TThreadId,
} from "../types";
import { EChatRole, EMessagePartType, EToolApprovalMode, EToolCallStatus } from "../types";
import type {
	IBridgeBroadcaster,
	IMcpClient,
	IPermissions,
	IPersistence,
} from "../types/interfaces";
import { cleanSchema, validateToolArgs } from "../validation";

const MAX_PASSES = 10;

export interface IOrchestratorConfig {
	mcpClient: IMcpClient;
	permissions: IPermissions;
	persistence: IPersistence;
	broadcaster: IBridgeBroadcaster;
	eventNode: EventNode;
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

export interface IPureCompletionResult {
	content: IMessagePart[];
	stats: IChatMessageStats | null;
	finishReason: string;
}

export type TPureCompletionChunkHandler = (partType: string, deltaText: string) => void;

// Track in-flight inference URLs per thread so resume can continue
const threadInferenceUrls: Map<TThreadId, string> = new Map();
const threadInferenceMessageCache: Record<TThreadId, TOpenAIMessage[]> = {};

export class Orchestrator {
	private mcpClient: IMcpClient;
	private permissions: IPermissions;
	private persistence: IPersistence;
	private broadcaster: IBridgeBroadcaster;
	private eventNode: EventNode;
	private pureCompletionControllers: Record<string, AbortController> = {};
	private runningInferences: Set<TThreadId> = new Set();

	public isThreadRunningInference(threadId: TThreadId): boolean {
		return this.runningInferences.has(threadId);
	}

	constructor(config: IOrchestratorConfig) {
		this.mcpClient = config.mcpClient;
		this.permissions = config.permissions;
		this.persistence = config.persistence;
		this.broadcaster = config.broadcaster;
		this.eventNode = config.eventNode;
		this.installStateHandlers();
	}

	private installStateHandlers(): void {
		this.eventNode.fn("bridge.getAllMessageStatesByThread", async (api) => {
			const threadId = api.payload as string;
			return await this.persistence.getMessageStatesByThreadId(threadId);
		});

		this.eventNode.fn("bridge.getThreadState", async (api) => {
			const threadId = api.payload as string;
			return await this.persistence.getThreadState(threadId);
		});

		this.eventNode.fn("bridge.getWorkspaceState", async (api) => {
			const folderId = api.payload as string;
			return await this.persistence.getWorkspaceState(folderId);
		});

		this.eventNode.fn("bridge.getMessageState", async (api) => {
			const messageId = api.payload as string;
			return await this.persistence.getMessageState(messageId);
		});

		this.eventNode.fn("bridge.getToolCallsForMessage", async (api) => {
			const messageId = api.payload as string;
			return await this.persistence.getToolCallsForMessage(messageId);
		});

		this.eventNode.fn("bridge.updateMessageState", async (api) => {
			const payload = api.payload as { messageId: string; data: Record<string, unknown> };
			await this.persistence.updateMessageState(payload.messageId, payload.data);
		});

		this.eventNode.fn("bridge.listGuardrails", async () => {
			return await this.persistence.listGuardrails();
		});

		this.eventNode.fn("bridge.getMode", async (api) => {
			const id = api.payload as string;
			return await this.persistence.getMode(id);
		});

		this.eventNode.fn("bridge.listAgents", async (api) => {
			return await this.persistence.listAgents();
		});

		this.eventNode.fn("bridge.getChatPrompt", async (api) => {
			const id = api.payload as string;
			return await this.persistence.getChatPrompt(id);
		});

		this.eventNode.fn("bridge.handlePureCompletion", async (api) => {
			const payload = api.payload as {
				inferenceRequestId: string;
				inferenceUrl: string;
				messages: Array<TOpenAIMessage>;
				inferenceParams?: Record<string, unknown>;
			};
			const { inferenceRequestId, inferenceUrl, messages, inferenceParams } = payload;
			const controller = new AbortController();
			this.pureCompletionControllers[inferenceRequestId] = controller;
			try {
				return await this.handlePureCompletions(
					inferenceUrl,
					messages,
					inferenceParams || {},
					(partType, deltaText) => {
						this.eventNode.broadcast(
							"bridge.pure_completion_chunk." + inferenceRequestId,
							{ partType, deltaText },
						);
					},
					controller.signal,
				);
			} finally {
				delete this.pureCompletionControllers[inferenceRequestId];
			}
		});

		this.eventNode.fn("bridge.cancelPureCompletion", async (api) => {
			const id = api.payload as string;
			const controller = this.pureCompletionControllers[id];
			if (controller) {
				controller.abort();
				delete this.pureCompletionControllers[id];
			}
			return { cancelled: !!controller };
		});

		this.eventNode.fn("bridge.isThreadRunningInference", async (api) => {
			return this.isThreadRunningInference(api.payload as TThreadId);
		});

		this.eventNode.fn("bridge.getThread", async (api) => {
			return this.persistence.getThread(api.payload as TThreadId);
		});

		this.eventNode.fn("bridge.listNotifications", async (api) => {
			const { threadId } = api.payload as { threadId: string };
			return this.persistence.notificationList(threadId, false, false);
		});

		this.eventNode.fn("bridge.consumeNotification", async (api) => {
			return this.persistence.notificationConsume(api.payload as string);
		});

		this.eventNode.fn("bridge.getThreadAttachedTools", async (api) => {
			return this.persistence.getThreadAttachedTools(api.payload as TThreadId);
		});

		this.eventNode.fn("bridge.handleCompletion", async (api) => {
			const { inferenceUrl, request } = api.payload as {
				inferenceUrl: string;
				request: ICompletionRequest;
			};
			const ac = new AbortController();
			this.handleCompletionV2(inferenceUrl, request, ac.signal).catch(console.error);
		});
	}

	// Walk parentId chain from a given message ID up to root, return root-to-leaf
	private buildBranchChain(
		allMessages: IChatMessage[],
		fromMessageId: TMessageId | null | undefined,
	): IChatMessage[] {
		if (!fromMessageId) return [];
		const msgMap = new Map<TMessageId, IChatMessage>();
		for (const m of allMessages) msgMap.set(m.id, m);

		const chain: IChatMessage[] = [];
		let currentId: TMessageId | null | undefined = fromMessageId;
		while (currentId) {
			const msg = msgMap.get(currentId);
			if (!msg) break;
			chain.push(msg);
			currentId = msg.parentId ?? undefined;
		}
		return chain.reverse();
	}

	// Build the full message chain for an inference pass:
	// workspace context + system prompt + branch history from DB + any extra messages.
	private async buildMessageChain(
		request: ICompletionRequest,
		fromMessageId: TMessageId | undefined,
		extraMessages: Array<any> = [],
	): Promise<Array<TOpenAIMessage>> {
		const baseMessages: Array<TOpenAIMessage> = [];

		const systemParts: string[] = [];
		if (request.folderId) {
			const ctx = await this.buildWorkspaceContext(request.folderId);
			if (ctx) systemParts.push(ctx.content);
		}
		const thread = await this.persistence.getThread(request.threadId);
		if (thread?.systemPrompt) systemParts.push(thread.systemPrompt);
		if (systemParts.length > 0) {
			baseMessages.push({ role: "system", content: systemParts.join("\n\n") });
		}

		const allMessages = await this.persistence.getMessages(request.threadId);
		const allToolCalls = await this.persistence.getToolCallsForThread(request.threadId);
		const toolCallsMap: Record<string, IToolCall> = {};
		for (const tc of allToolCalls) toolCallsMap[tc.id] = tc;

		const branchChain = this.buildBranchChain(allMessages, fromMessageId);

		// Pipe branch for compaction — applet can truncate
		const processedChain = (await this.eventNode.pipe(
			"bridge.buildBranchChain",
			{
				allMessages,
				branch: branchChain,
				request,
				fromMessageId,
				extraMessages,
			},
			".",
			branchChain,
		)) as IChatMessage[];

		const openAIMessages = convertMessagesToOpenAIFormat(processedChain, toolCallsMap);
		baseMessages.push(...openAIMessages);
		baseMessages.push(...extraMessages);

		return baseMessages;
	}

	private async buildWorkspaceContext(
		folderId: TFolderId,
	): Promise<{ role: "system"; content: string } | null> {
		const workspace = await this.persistence.getWorkspace(folderId);
		if (!workspace) return null;
		const folder = await this.persistence.getFolder(folderId);
		if (!folder) return null;
		const desc = (workspace.data as Record<string, unknown>)?.description as string | undefined;
		const content = desc ? `Workspace: ${folder.name}\n${desc}` : `Workspace: ${folder.name}`;
		return { role: "system", content };
	}

	private async resolveWsVars(threadId: TThreadId): Promise<Record<string, unknown> | null> {
		const thread = await this.persistence.getThread(threadId);
		if (!thread) return null;

		if (thread.folderId) {
			const folder = await this.persistence.getFolder(thread.folderId);
			if (!folder) return null;
			const workspace = await this.persistence.getWorkspace(thread.folderId);
			const wsVars: Record<string, unknown> = {
				threadId,
				folderId: folder.id,
				topic: folder.topic,
				name: folder.name,
			};
			if (workspace) {
				for (const [key, value] of Object.entries(workspace.data)) {
					wsVars[key] = value;
				}
			}
			return wsVars;
		}

		return { threadId, folderId: null, topic: "global", name: "global" };
	}

	private async resolveThreadVars(threadId: TThreadId): Promise<Record<string, unknown> | null> {
		const threadState = await this.persistence.getThreadState(threadId);
		let result = threadState || {};
		if (!result.projectRoot) {
			const thread = await this.persistence.getThread(threadId);
			if (thread?.folderId) {
				const wsState = await this.persistence.getWorkspaceState(thread.folderId);
				if (wsState?.projectRoot) {
					result = { ...result, projectRoot: wsState.projectRoot };
				}
			}
		}
		return Object.keys(result).length > 0 ? result : null;
	}

	// V2: builds message chain from persistence instead of receiving it from frontend
	async handleCompletionV2(
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		let cause: EThreadInferenceEndCause = EThreadInferenceEndCause.COMPLETED;
		const setCause = (newCause: EThreadInferenceEndCause) => {
			if (cause === EThreadInferenceEndCause.COMPLETED) {
				cause = newCause;
			} else {
				console.error(
					`[Orchestrator] Cannot override inference cause: ${cause} → ${newCause} for thread ${request.threadId}`,
				);
			}
		};
		this.runningInferences.add(request.threadId);
		this.eventNode.broadcast("bridge.threadInference.started", { threadId: request.threadId });
		try {
			// Auto-create thread if needed
			let thread = await this.persistence.getThread(request.threadId);
			let isNewThread: boolean = false;
			if (!thread) {
				isNewThread = true;
				const now = Date.now();
				let title = "New Chat";
				if (request.userMessage) {
					title = this.truncateTitle(request.userMessage.content);
				}
				thread = {
					id: request.threadId,
					title,
					folderId: request.folderId ?? null,
					parentId: request.threadParentId ?? null,
					systemPrompt: request.systemPrompt ?? "",
					meta: JSON.stringify({
						serverId: request.serverId ?? null,
						whisperServerId: request.whisperServerId ?? null,
						tags: [],
						enableAutoEmbed: request.enableAutoEmbed ?? false,
					}),
					totalPromptTokens: 0,
					totalCompletionTokens: 0,
					createdAt: now,
					updatedAt: now,
				};
				await this.persistence.createThread(thread);
				if (request.threadState)
					await this.persistence.updateThreadState(thread.id, request.threadState);
				await this.persistence.setThreadConfig({
					threadId: request.threadId,
					presetId: request.presetId ?? null,
					systemPrompt: request.systemPrompt ?? "",
					params: JSON.stringify(request.inferenceParams ?? {}),
				});
				this.broadcaster.emit({ type: "thread.created", thread });
			}

			// Normalize folderId from thread (request.folderId may be stale from frontend)
			request.folderId = thread.folderId;

			// Stash inference URL for post-approval resume
			threadInferenceUrls.set(request.threadId, inferenceUrl);

			// Determine parent for the first assistant message
			let parentForAssistant: string | null = request.parentId ?? null;

			// If userMessage content provided, bridge generates ID and saves
			let userMsg: IChatMessage | null = null;
			if (request.userMessage) {
				const userMessageId = genMessageId();
				const content: IMessagePart[] = [
					{
						id: genPartId(),
						type: EMessagePartType.TEXT,
						orderIndex: 0,
						text: request.userMessage.content,
					},
				];

				if (request.attachments?.length) {
					for (const att of request.attachments) {
						content.push({
							id: genPartId(),
							type: EMessagePartType.ATTACHMENT,
							orderIndex: content.length,
							data: att.data,
							mimeType: att.mimeType,
							fileName: att.fileName,
							fileSize: att.fileSize,
							extractedText: att.extractedText,
						});
					}
				}

				const userActualTokens = content.reduce((acc, p) => {
					if (p.type === EMessagePartType.TEXT || p.type === EMessagePartType.REASONING)
						return acc + (p.text ?? "").length;
					if (p.type === EMessagePartType.ATTACHMENT) return acc + (p.data?.length ?? 0);
					return acc;
				}, 0);
				userMsg = {
					id: userMessageId,
					parentId: request.parentId ?? null,
					threadId: request.threadId,
					role: EChatRole.USER,
					content,
					stats: {
						promptTokens: 0,
						completionTokens: 0,
						reasoningTokens: 0,
						actualTokens: Math.ceil(userActualTokens / 4),
					},
					createdAt: Date.now(),
				};
				await this.persistence.createMessage(userMsg);
				await this.persistence.incrementThreadTokens(
					request.threadId,
					userMsg.stats!.actualTokens ?? 0,
					0,
				);
				if (request.messageState) {
					await this.persistence.updateMessageState(userMessageId, request.messageState);
				}
				this.broadcaster.emit({ type: "message.created", message: userMsg });
				parentForAssistant = userMessageId;
			}
			const enabledTools = await this.resolveEnabledTools(request);

			// Build base messages for LLM context — V2: from persistence
			const baseMessages = await this.buildMessageChain(
				request,
				request.parentId ?? undefined,
			);
			if (userMsg) {
				userMsg = (await this.eventNode.pipe(
					"bridge.preConvertNewMsg",
					{ request, userMsg },
					".",
					userMsg,
				)) as IChatMessage;

				const converted = convertMessagesToOpenAIFormat([userMsg], {});
				baseMessages.push(...converted);
			}

			await this.executePass(
				inferenceUrl,
				request,
				parentForAssistant,
				baseMessages,
				enabledTools,
				abortSignal,
				setCause,
			);

			// Fire title generation after response completes (fire-and-forget)
			if (request.userMessage && request.generateTitle && isNewThread) {
				this.generateTitle(inferenceUrl, request.userMessage.content)
					.then((title) => {
						this.persistence.updateThread(request.threadId, { title });
						this.broadcaster.emit({
							type: "thread.updated",
							threadId: request.threadId,
							updates: { title },
						});
					})
					.catch(() => {
						// Title generation failed, keep truncated title
					});
			}
		} catch (err) {
			setCause(
				abortSignal.aborted
					? EThreadInferenceEndCause.ABORTED
					: EThreadInferenceEndCause.ERROR,
			);
			const errorMsg = err instanceof Error ? err.message : String(err);
			if (abortSignal.aborted) {
				this.broadcaster.emit({
					type: "inference.ended",
					threadId: request.threadId,
					messageId: request.parentId ?? genMessageId(),
				});
			} else {
				console.error("[Orchestrator] handleCompletionV2 error:", errorMsg);
				this.broadcaster.emit({
					type: "inference.error",
					threadId: request.threadId,
					messageId: request.parentId ?? genMessageId(),
					error: errorMsg,
				});
			}
		} finally {
			this.runningInferences.delete(request.threadId);
			this.eventNode.broadcast("bridge.threadInference.ended", {
				threadId: request.threadId,
				cause,
			});
		}
	}

	// Execute one inference pass: create assistant message, run inference,
	// emit lifecycle events, and recursively trigger the next pass if tool
	// calls auto-resolved. Does NOT loop.
	private async executePass(
		inferenceUrl: string,
		request: ICompletionRequest,
		parentId: TMessageId | null,
		messages: Array<TOpenAIMessage>,
		enabledTools: IToolDefinition[],
		abortSignal: AbortSignal,
		setCause: (c: EThreadInferenceEndCause) => void,
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
			type: "inference.started",
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
					type: "message.patched",
					messageId: assistantMsg.id,
					threadId: request.threadId,
					updates: {
						stats: finalMessage.stats ?? undefined,
						replaceParts: finalMessage.content,
					},
				});
			}
			this.broadcaster.emit({
				type: "inference.ended",
				threadId: request.threadId,
				messageId: assistantMsg.id,
			});
			this.eventNode.broadcast("bridge.inference.finish", {
				threadId: request.threadId,
				messageId: assistantMsg.id,
				inferenceUrl,
				messages,
				message: finalMessage,
			});
		}

		// Stop conditions: waiting for approval, or no tool calls fired
		if (!result) return;
		if (result.needsAsk) {
			setCause(EThreadInferenceEndCause.PENDING_APPROVAL);
			return;
		}
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
			setCause,
		);
	}

	private async createAssistantMessage(
		threadId: TThreadId,
		parentId: TMessageId | null,
	): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: genMessageId(),
			parentId,
			threadId,
			role: EChatRole.ASSISTANT,
			content: [],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: "message.created", message: msg });
		return msg;
	}

	private async createToolMessage(
		threadId: TThreadId,
		parentId: TMessageId,
		toolCallId: string,
	): Promise<IChatMessage> {
		const msg: IChatMessage = {
			id: genMessageId(),
			parentId,
			threadId,
			role: EChatRole.TOOL,
			content: [
				{
					id: genPartId(),
					type: EMessagePartType.TOOL_CALL,
					orderIndex: 0,
					toolCallId,
				},
			],
			stats: null,
			createdAt: Date.now(),
		};
		await this.persistence.createMessage(msg);
		this.broadcaster.emit({ type: "message.created", message: msg });
		return msg;
	}

	// Single inference pass. Streams to llama-server, persists parts,
	// emits chunk and patch events. Returns whether tool calls fired.
	private async runPass(
		inferenceUrl: string,
		messages: Array<TOpenAIMessage>,
		enabledTools: IToolDefinition[],
		request: ICompletionRequest,
		abortSignal: AbortSignal,
		turn: ITurnState,
	): Promise<IPassResult> {
		const openAiTools: IOpenAITool[] = enabledTools.map((t) => ({
			type: "function" as const,
			function: {
				name: t.name,
				description: t.description,
				parameters: cleanSchema(t.inputSchema),
			},
		}));
		const hasTools = openAiTools.length > 0;

		let finalMessages = [...messages];
		finalMessages = (await this.eventNode.pipe(
			"bridge.preInference",
			{ request, messages: finalMessages },
			".",
			finalMessages,
		)) as Array<TOpenAIMessage>;

		this.checkMessageDivergence(request.threadId, finalMessages);

		this.eventNode.broadcast("console-log", {
			type: "inference_debug",
			threadId: request.threadId,
			messages: finalMessages,
			openAiTools,
		});

		const body: Record<string, unknown> = {
			model: "model",
			messages: finalMessages,
			stream: true,
			...(hasTools ? { tools: openAiTools } : {}),
			...this.buildInferenceParams(request.inferenceParams),
		};

		const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: "Bearer warpcore" },
			body: stableStringify(body),
			signal: abortSignal,
		});

		if (!response.ok || !response.body) {
			const errBody = await response.text().catch(() => "");
			const errorMessage = `Inference error ${response.status}: ${errBody}`;
			console.error(`[Orchestrator] ${errorMessage}`);
			this.broadcaster.emit({
				type: "inference.error",
				threadId: request.threadId,
				messageId: turn.assistantMessageId,
				error: errorMessage,
			});
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let fullText = "";
		let reasoningText = "";
		let timings: Record<string, number> | null = null;
		let usage: Record<string, number> | null = null;
		let finishReason = "";
		const toolCallAccumulators: Record<number, IToolCallAccumulator> = {};
		let streamError: string | null = null;

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const { chunks, remaining, done: sseDone } = parseSSEBuffer(buffer);
				if (sseDone) {
					// [DONE] marker received
				}
				buffer = remaining;

				for (const chunk of chunks) {
					if (abortSignal.aborted) {
						await this.flushReasoningPart(turn);
						await this.flushTextPart(turn);
						return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
					}
					if (chunk.error || chunk.warpcore_event === "error") {
						streamError = chunk.error ?? "Inference error from server";
						break;
					}
					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						fullText += delta.content;
						if (turn.currentReasoningPart) {
							await this.flushReasoningPart(turn);
						}
						if (!turn.currentTextPart) {
							turn.currentTextPart = { id: genPartId(), text: "" };
							this.broadcaster.emit({
								type: "message.patched",
								messageId: turn.assistantMessageId,
								threadId: request.threadId,
								updates: {
									addParts: [
										{
											id: turn.currentTextPart.id,
											type: EMessagePartType.TEXT,
											orderIndex: turn.partOrderCounter,
											text: "",
										},
									],
								},
							});
						}
						turn.currentTextPart.text += delta.content;
						// First chunk of text content
						if (
							delta.content.length > 0 &&
							turn.currentTextPart.text.length - delta.content.length === 0
						) {
							// first chunk
						}
						this.broadcaster.emit({
							type: "message.chunk",
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							partId: turn.currentTextPart.id,
							partType: EMessagePartType.TEXT,
							deltaText: delta.content,
						});
					}

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						if (turn.currentTextPart) {
							await this.flushTextPart(turn);
						}
						if (!turn.currentReasoningPart) {
							turn.currentReasoningPart = { id: genPartId(), text: "" };
							this.broadcaster.emit({
								type: "message.patched",
								messageId: turn.assistantMessageId,
								threadId: request.threadId,
								updates: {
									addParts: [
										{
											id: turn.currentReasoningPart.id,
											type: EMessagePartType.REASONING,
											orderIndex: turn.partOrderCounter,
											text: "",
										},
									],
								},
							});
						}
						turn.currentReasoningPart.text += delta.reasoning_content;
						this.broadcaster.emit({
							type: "message.chunk",
							messageId: turn.assistantMessageId,
							threadId: request.threadId,
							partId: turn.currentReasoningPart.id,
							partType: EMessagePartType.REASONING,
							deltaText: delta.reasoning_content,
						});
					}

					if (delta?.tool_calls) {
						for (const tc of delta.tool_calls) {
							const hadName = !!toolCallAccumulators[tc.index]?.name;
							accumulateToolCallDelta(toolCallAccumulators, tc);
							if (!hadName) {
								const name = toolCallAccumulators[tc.index]?.name;
								if (name) {
									// Allow hooks to block tool calls based on mode restrictions
									const shouldAbort = await this.eventNode.pipe(
										"bridge.preTool",
										{
											request,
											threadId: request.threadId,
											messageId: turn.assistantMessageId,
											toolName: name,
											toolIndex: tc.index,
											toolCallId: toolCallAccumulators[tc.index]?.id ?? "",
										},
										".",
										false,
									);
									if (shouldAbort) {
										await this.flushReasoningPart(turn);
										await this.flushTextPart(turn);
										return {
											hadToolCalls: false,
											needsAsk: false,
											lastToolMessageId: null,
										};
									}

									this.broadcaster.emit({
										type: "tool_call.starting",
										threadId: request.threadId,
										messageId: turn.assistantMessageId,
										name,
									});
								}
							}
						}
					}

					const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) {
						finishReason = fr;
					}
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
				if (sseDone) {
					break;
				}
			}
		} finally {
			await this.flushReasoningPart(turn);
			await this.flushTextPart(turn);
		}

		if (streamError) {
			console.error("[Orchestrator] Stream Error!", streamError);
			this.broadcaster.emit({
				type: "inference.error",
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
				promptTokens: usage?.prompt_tokens ?? timings?.prompt_n ?? 0,
				completionTokens: usage?.completion_tokens ?? timings?.predicted_n ?? 0,
				reasoningTokens: usage?.reasoning_tokens ?? 0,
				actualTokens,
				promptPerSecond: timings?.prompt_per_second ?? 0,
				predictedPerSecond: timings?.predicted_per_second ?? 0,
				promptMs: timings?.prompt_ms ?? 0,
				predictedMs: timings?.predicted_ms ?? 0,
				finishReason,
			};
			await this.persistence.updateMessage(turn.assistantMessageId, { stats });
			this.broadcaster.emit({
				type: "message.patched",
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

		messages.push({
			role: "assistant",
			content: fullText || (null as any),
			...(reasoningText ? { reasoning_content: reasoningText } : {}),
			tool_calls: finalToolCalls.map((tc) => ({
				id: tc.id,
				type: "function",
				function: { name: tc.name, arguments: tc.arguments },
			})),
		} as any);

		if (finalToolCalls.length === 0 || finishReason !== "tool_calls") {
			return { hadToolCalls: false, needsAsk: false, lastToolMessageId: null };
		}

		// Process tool calls — chain tool messages linearly off the assistant
		let needsAsk = false;
		let lastToolMessageId: TMessageId | null = null;
		let previousToolMessageId: TMessageId = turn.assistantMessageId;

		for (const tc of finalToolCalls) {
			if (abortSignal.aborted)
				return { hadToolCalls: true, needsAsk: false, lastToolMessageId };

			const enabledTool = enabledTools.find((t) => t.name === tc.name);
			const serverName = enabledTool?.serverName ?? this.mcpClient.findToolServer(tc.name);
			//console.log('[Orch] tool call:', { toolName: tc.name, serverName, threadId: request.threadId });
			let args: Record<string, unknown> = {};
			try {
				args = JSON.parse(tc.arguments || "{}");
			} catch {
				/* empty */
			}

			let validationError: string | null = null;
			if (!serverName) {
				validationError = `No MCP server for tool '${tc.name}'`;
			} else {
				const toolDef = enabledTools.find((t) => t.name === tc.name);
				if (toolDef) {
					const validation = validateToolArgs(toolDef.inputSchema, args);
					if (!validation.valid) {
						validationError = `Invalid arguments: ${validation.errors.join(", ")}`;
					}
				}
			}

			// Use model's raw tool call ID for correlation with guardrails
			const toolCallId = tc.id;
			const toolMessageId = genMessageId();

			const toolCallRecord: IToolCall = {
				id: toolCallId,
				messageId: toolMessageId,
				threadId: request.threadId,
				serverName: serverName ?? "",
				toolName: tc.name,
				arguments: tc.arguments || "{}",
				result: validationError ? JSON.stringify({ error: validationError }) : null,
				status: validationError ? EToolCallStatus.ERROR : EToolCallStatus.PENDING,
				error: validationError,
				createdAt: Date.now(),
				resolvedAt: validationError ? Date.now() : null,
			};

			// Order: tool_call.created -> message.patched (assistant gets tool_call part) -> message.created (tool message)
			await this.persistence.createToolCall(toolCallRecord);
			this.broadcaster.emit({ type: "tool_call.created", toolCall: toolCallRecord });

			const toolPart: IMessagePart = {
				id: genPartId(),
				type: EMessagePartType.TOOL_CALL,
				orderIndex: turn.partOrderCounter++,
				toolCallId,
			};
			await this.persistence.appendMessagePart(turn.assistantMessageId, toolPart);
			this.broadcaster.emit({
				type: "message.patched",
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
				content: [
					{
						id: genPartId(),
						type: EMessagePartType.TOOL_CALL,
						orderIndex: 0,
						toolCallId,
					},
				],
				stats: null,
				createdAt: Date.now(),
			};
			await this.persistence.createMessage(toolMsg);
			this.broadcaster.emit({ type: "message.created", message: toolMsg });

			previousToolMessageId = toolMessageId;
			lastToolMessageId = toolMessageId;

			if (validationError) {
				messages.push({
					role: "tool",
					content: toolCallRecord.result!,
					tool_call_id: tc.id,
				} as any);
				continue;
			}

			const approvalMode = await this.permissions.getToolApprovalMode(
				request.threadId,
				serverName!,
				tc.name,
			);
			//console.log('[Orch] approvalMode:', approvalMode);

			if (approvalMode === EToolApprovalMode.ASK) {
				needsAsk = true;
				continue;
			}

			if (approvalMode === EToolApprovalMode.DENIED) {
				const deniedTc: IToolCall = {
					...toolCallRecord,
					status: EToolCallStatus.DENIED,
					result: JSON.stringify({ error: "Tool call denied by policy" }),
					resolvedAt: Date.now(),
				};
				await this.persistence.updateToolCall(toolCallId, {
					status: deniedTc.status,
					result: deniedTc.result,
					resolvedAt: deniedTc.resolvedAt,
				});
				this.broadcaster.emit({ type: "tool_call.updated", toolCall: deniedTc });
				messages.push({
					role: "tool",
					content: deniedTc.result!,
					tool_call_id: tc.id,
				} as any);
				continue;
			}

			// ALLOWED — execute now
			const executingTc: IToolCall = { ...toolCallRecord, status: EToolCallStatus.EXECUTING };
			await this.persistence.updateToolCall(toolCallId, {
				status: EToolCallStatus.EXECUTING,
			});
			this.broadcaster.emit({ type: "tool_call.updated", toolCall: executingTc });

			try {
				const wsVars = await this.resolveWsVars(request.threadId);
				const tsVars = await this.resolveThreadVars(request.threadId);
				const finalArgs = this.mcpClient.prepareToolArgs(
					serverName!,
					tc.name,
					args,
					wsVars,
					tsVars,
				);
				// console.log(
				// 	"[orchestrator] tool call:",
				// 	serverName,
				// 	tc.name,
				// 	"wsVars:",
				// 	wsVars,
				// 	"tsVars:",
				// 	tsVars,
				// 	"finalArgs:",
				// 	JSON.stringify(finalArgs),
				// );
				const mcpResult = await this.mcpClient.executeToolCall(
					serverName!,
					tc.name,
					finalArgs,
					request.threadId,
				);
				const resultStr = stableStringify(mcpResult.content);
				const finalStatus = mcpResult.isError
					? EToolCallStatus.ERROR
					: EToolCallStatus.COMPLETED;
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
				this.broadcaster.emit({ type: "tool_call.updated", toolCall: completedTc });
				messages.push({
					role: "tool",
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
				this.broadcaster.emit({ type: "tool_call.updated", toolCall: erroredTc });
				messages.push({
					role: "tool",
					content: errorResult,
					tool_call_id: tc.id,
				} as any);
			}
		}

		return { hadToolCalls: true, needsAsk, lastToolMessageId };
	}

	private checkMessageDivergence(threadId: TThreadId, currentMessages: TOpenAIMessage[]): void {
		try {
			const cachedMessages = threadInferenceMessageCache[threadId];
			if (!cachedMessages) {
				threadInferenceMessageCache[threadId] = currentMessages;
				return;
			}

			const minLen = Math.min(cachedMessages.length, currentMessages.length);
			for (let i = 0; i < minLen; i++) {
				const oldMsg = cachedMessages[i];
				const newMsg = currentMessages[i];
				if (!isDeepStrictEqual(oldMsg, newMsg)) {
					console.warn(
						"inference_message_divergence",
						JSON.stringify(oldMsg),
						JSON.stringify(newMsg),
					);
					this.eventNode.broadcast("console-log", {
						type: "inference_message_divergence",
						threadId,
						divergentIndex: i,
						cachedThread: cachedMessages,
						currentThread: currentMessages,
						divergentCachedMessage: oldMsg,
						divergentCurrentMessage: newMsg,
					});
					break;
				}
			}
			threadInferenceMessageCache[threadId] = currentMessages;
		} catch {
			// non-fatal, do not interrupt inference
		}
	}

	// Update the divergence cache with the post-inference messages (including the
	// assistant response) so the next turn does not falsely detect divergence.
	private updateDivergenceCache(threadId: TThreadId, currentMessages: TOpenAIMessage[]): void {
		threadInferenceMessageCache[threadId] = currentMessages;
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

	// V2: builds message chain from persistence instead of receiving it from frontend
	async resumeToolCallV2(
		toolCallId: string,
		decision: "approve" | "deny",
		inferenceUrl: string,
		request: ICompletionRequest,
		abortSignal: AbortSignal,
	): Promise<void> {
		const tc = await this.persistence.getToolCall(toolCallId);
		if (!tc) throw new Error("Tool call not found");
		if (tc.status !== EToolCallStatus.PENDING)
			throw new Error(`Tool call is ${tc.status}, not PENDING`);

		// Normalize folderId from thread
		const thread = await this.persistence.getThread(request.threadId);
		if (thread) request.folderId = thread.folderId;

		if (decision === "deny") {
			const deniedTc: IToolCall = {
				...tc,
				status: EToolCallStatus.DENIED,
				result: JSON.stringify({ error: "Tool call denied by user" }),
				resolvedAt: Date.now(),
			};
			await this.persistence.updateToolCall(toolCallId, {
				status: deniedTc.status,
				result: deniedTc.result,
				resolvedAt: deniedTc.resolvedAt,
			});
			this.broadcaster.emit({ type: "tool_call.updated", toolCall: deniedTc });
		} else {
			const executingTc: IToolCall = { ...tc, status: EToolCallStatus.EXECUTING };
			await this.persistence.updateToolCall(toolCallId, {
				status: EToolCallStatus.EXECUTING,
			});
			this.broadcaster.emit({ type: "tool_call.updated", toolCall: executingTc });

			try {
				const args = JSON.parse(tc.arguments);
				const wsVars = await this.resolveWsVars(tc.threadId);
				const tsVars = await this.resolveThreadVars(tc.threadId);
				const finalArgs = this.mcpClient.prepareToolArgs(
					tc.serverName,
					tc.toolName,
					args,
					wsVars,
					tsVars,
				);
				//console.log('[orchestrator] resume tool call:', tc.serverName, tc.toolName, 'wsVars:', wsVars, 'tsVars:', tsVars, 'finalArgs:', JSON.stringify(finalArgs));
				const mcpResult = await this.mcpClient.executeToolCall(
					tc.serverName,
					tc.toolName,
					finalArgs,
					tc.threadId,
				);
				const resultStr = stableStringify(mcpResult.content);
				const finalStatus = mcpResult.isError
					? EToolCallStatus.ERROR
					: EToolCallStatus.COMPLETED;
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
				this.broadcaster.emit({ type: "tool_call.updated", toolCall: completedTc });
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
				this.broadcaster.emit({ type: "tool_call.updated", toolCall: erroredTc });
			}
		}

		// Check if any other tool calls in the same parent assistant message
		// are still pending. If so, wait for them too.
		let assistantMsg: IChatMessage | null = null;
		let cursorId: TMessageId | null = tc.messageId;
		while (cursorId) {
			const cursorMsg = await this.persistence.getMessage(cursorId);
			if (!cursorMsg || cursorMsg.role !== EChatRole.TOOL) {
				assistantMsg = cursorMsg ?? null;
				break;
			}
			cursorId = cursorMsg.parentId;
		}

		if (!assistantMsg) return;

		const allInChain = await Promise.all(
			assistantMsg.content
				.filter((p): p is IMessagePartToolCall => p.type === EMessagePartType.TOOL_CALL)
				.map((p) => p.toolCallId)
				.map((id) => this.persistence.getToolCall(id)),
		);
		const stillBlocking = allInChain.some(
			(t) =>
				t &&
				(t.status === EToolCallStatus.PENDING ||
					t.status === EToolCallStatus.EXECUTING ||
					t.status === EToolCallStatus.DENIED),
		);
		if (stillBlocking) return;

		// Convert resolved tool calls to OpenAI format and append to messages
		// const toolOpenAIMessages = allInChain
		// 	.filter((tc): tc is IToolCall => tc !== null)
		// 	.map(tc => ({
		// 		role: 'tool' as const,
		// 		content: tc.result ?? JSON.stringify({ error: tc.error }),
		// 		tool_call_id: tc.id,
		// 	}));

		// All tool calls resolved — trigger next inference pass
		const enabledTools = await this.resolveEnabledTools(request);
		const baseMessages = await this.buildMessageChain(request, tc.messageId);

		this.runningInferences.add(request.threadId);
		this.eventNode.broadcast("bridge.threadInference.started", { threadId: request.threadId });
		let cause: EThreadInferenceEndCause = EThreadInferenceEndCause.COMPLETED;
		const setCause = (newCause: EThreadInferenceEndCause) => {
			if (cause === EThreadInferenceEndCause.COMPLETED) {
				cause = newCause;
			} else {
				console.error(
					`[Orchestrator] Cannot override inference cause: ${cause} → ${newCause} for thread ${request.threadId}`,
				);
			}
		};
		try {
			await this.executePass(
				inferenceUrl,
				request,
				tc.messageId,
				baseMessages,
				enabledTools,
				abortSignal,
				setCause,
			);
		} finally {
			this.runningInferences.delete(request.threadId);
			this.eventNode.broadcast("bridge.threadInference.ended", {
				threadId: request.threadId,
				cause,
			});
		}
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
			...(p.mirostatMode > 0
				? {
						mirostat: p.mirostatMode,
						mirostat_tau: p.mirostatTau,
						mirostat_eta: p.mirostatEta,
					}
				: {}),
			...(p.cachePrompt ? { cache_prompt: true } : {}),
			...(p.responseFormat && p.responseFormat !== "text"
				? { response_format: { type: p.responseFormat } }
				: {}),
			...(p.reasoningFormat && p.reasoningFormat !== "none"
				? { reasoning_format: p.reasoningFormat }
				: {}),
			...(p.enableThinking !== undefined || p.reasoningEffort !== undefined
				? {
						chat_template_kwargs: {
							...(p.enableThinking !== undefined
								? { enable_thinking: p.enableThinking }
								: {}),
							...(p.reasoningEffort !== undefined
								? { reasoning_effort: p.reasoningEffort }
								: {}),
						},
					}
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

	private async resolveEnabledTools(request: ICompletionRequest): Promise<IToolDefinition[]> {
		// Save to DB — convenience for UI reload only, doesn't affect filtering
		if (
			!request.skipToolsSave &&
			(request.attachAllTools !== undefined || request.attachedTools !== undefined)
		) {
			await this.persistence.saveThreadAttachedTools(
				request.threadId,
				request.attachAllTools ?? false,
				request.attachedTools ?? [],
			);
		}

		// Filter — ONLY from request, no DB fallback
		const attachAllTools = request.attachAllTools ?? false;
		const attachedTools = request.attachedTools;
		const allTools = this.mcpClient.getAllTools();

		let result: IToolDefinition[];

		if (attachAllTools) {
			result = await this.permissions.getEnabledTools(request.threadId, allTools);
		} else if (attachedTools && attachedTools.length > 0) {
			const filtered = allTools.filter((t) =>
				attachedTools.some((a) => a.serverName === t.serverName && a.toolName === t.name),
			);
			result = await this.permissions.getEnabledTools(request.threadId, filtered);
		} else {
			result = [];
		}

		// Stabilize order: sort by serverName, then tool name
		result.sort((a, b) =>
			a.serverName === b.serverName
				? a.name.localeCompare(b.name)
				: a.serverName.localeCompare(b.serverName),
		);

		return result;
	}

	private generateTitle(inferenceUrl: string, userContent: string): Promise<string> {
		return fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: "Bearer warpcore" },
			body: JSON.stringify({
				model: "model",
				messages: [
					{
						role: "user",
						content:
							"Generate a concise 3-5 word title for the conversation below. Return ONLY the title text, no quotes, no explanation.\n\n" +
							userContent,
					},
				],
				stream: false,
				max_tokens: 30,
				temperature: 0.3,
				chat_template_kwargs: { enable_thinking: false },
			}),
		})
			.then((res) => {
				if (!res.ok || !res.body) throw new Error("Title generation failed");
				return res.json();
			})
			.then((body) => {
				const title = body?.choices?.[0]?.message?.content ?? "";
				if (!title) throw new Error("Empty title response");
				return title.replace(/^["']|["']$/g, "").trim();
			});
	}

	private truncateTitle(text: string): string {
		const words = text.split(/\s+/).filter(Boolean).slice(0, 5);
		return words.join(" ") || "New Chat";
	}

	async handlePureCompletions(
		inferenceUrl: string,
		messages: Array<TOpenAIMessage>,
		inferenceParams: Record<string, unknown>,
		onChunk?: TPureCompletionChunkHandler,
		abortSignal?: AbortSignal,
	): Promise<IPureCompletionResult> {
		const body: Record<string, unknown> = {
			model: "model",
			messages,
			stream: true,
			...this.buildInferenceParams(inferenceParams),
		};

		const response = await fetch(`${inferenceUrl}/v1/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: "Bearer warpcore" },
			body: stableStringify(body),
			signal: abortSignal,
		});

		if (!response.ok || !response.body) {
			const errBody = await response.text().catch(() => "");
			throw new Error(`Inference error ${response.status}: ${errBody}`);
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";
		let fullText = "";
		let reasoningText = "";
		let timings: Record<string, number> | null = null;
		let usage: Record<string, number> | null = null;
		let finishReason = "";
		let streamError: string | null = null;

		const parts: IMessagePart[] = [];
		let partOrder = 0;
		let currentTextPart: { id: string; text: string } | null = null;
		let currentReasoningPart: { id: string; text: string } | null = null;

		const flushText = (): void => {
			if (!currentTextPart || !currentTextPart.text) return;
			parts.push({
				id: currentTextPart.id,
				type: EMessagePartType.TEXT,
				orderIndex: partOrder++,
				text: currentTextPart.text,
			});
			currentTextPart = null;
		};

		const flushReasoning = (): void => {
			if (!currentReasoningPart || !currentReasoningPart.text) return;
			parts.push({
				id: currentReasoningPart.id,
				type: EMessagePartType.REASONING,
				orderIndex: partOrder++,
				text: currentReasoningPart.text,
			});
			currentReasoningPart = null;
		};

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const { chunks, remaining } = parseSSEBuffer(buffer);
				buffer = remaining;

				for (const chunk of chunks) {
					if (abortSignal?.aborted) {
						flushReasoning();
						flushText();
						return { content: parts, stats: null, finishReason: "aborted" };
					}
					if (chunk.error || chunk.warpcore_event === "error") {
						streamError = chunk.error ?? "Inference error from server";
						break;
					}

					const delta = chunk.choices?.[0]?.delta;

					if (delta?.content) {
						fullText += delta.content;
						if (currentReasoningPart) flushReasoning();
						if (!currentTextPart) {
							currentTextPart = { id: genPartId(), text: "" };
						}
						currentTextPart.text += delta.content;
						onChunk?.("text", delta.content);
					}

					if (delta?.reasoning_content) {
						reasoningText += delta.reasoning_content;
						if (currentTextPart) flushText();
						if (!currentReasoningPart) {
							currentReasoningPart = { id: genPartId(), text: "" };
						}
						currentReasoningPart.text += delta.reasoning_content;
						onChunk?.("reasoning", delta.reasoning_content);
					}

					const fr = chunk.choices?.[0]?.finish_reason;
					if (fr) finishReason = fr;
					if (chunk.timings) timings = chunk.timings as Record<string, number>;
					if (chunk.usage) usage = chunk.usage as Record<string, number>;
				}
			}
		} finally {
			flushReasoning();
			flushText();
		}

		if (streamError) {
			throw new Error(streamError);
		}

		const actualTokens = Math.ceil((fullText.length + reasoningText.length) / 4);
		const stats: IChatMessageStats | null =
			timings || usage
				? {
						promptTokens: usage?.prompt_tokens ?? timings?.prompt_n ?? 0,
						completionTokens: usage?.completion_tokens ?? timings?.predicted_n ?? 0,
						reasoningTokens: usage?.reasoning_tokens ?? 0,
						actualTokens,
						promptPerSecond: timings?.prompt_per_second ?? 0,
						predictedPerSecond: timings?.predicted_per_second ?? 0,
						promptMs: timings?.prompt_ms ?? 0,
						predictedMs: timings?.predicted_ms ?? 0,
					}
				: null;

		return { content: parts, stats, finishReason };
	}
}
