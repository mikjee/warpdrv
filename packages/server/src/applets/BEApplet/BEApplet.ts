import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletAPIBE } from '../lib/types';
import type { IGuardrail, IGuardrailIssue, IServer } from '@warpcore/shared';
import { COMPACTION_PROMPT, GUARDRAIL_PROMPT, GUARDRAIL_RULESET_GENERIC_PROMPT } from './prompts';
import { store } from '../../util/store';
import { IChatMessage, TOpenAIMessage } from '@warpcore/bridge';

const GUARDRAILS_DEFAULT_INFERENCE_PARAMS = {
    enableThinking: false,
    reasoningEffort: "none",
};

const fn: IAppletFn<IAppletAPIBE> = async (api) => {
    console.log('[BEApplet] Started');

    api.onReady(() => {

        api.eventNode.hook('/warpcore', 'bridge.buildBranchChain', async (eventApi) => {
            const payload = eventApi.payload as {
                branch: Array<{ id: string }>;
                request: { threadId: string };
            };

            const threadState = await api.eventNode.invoke(
                '/warpcore',
                'bridge.getThreadState',
                payload.request.threadId,
            ) as Record<string, unknown> | null;

            if (threadState?.ignoreCompactionBase === true) {
                return eventApi.result;
            }

            const messageStates = await api.eventNode.invoke(
                '/warpcore',
                'bridge.getAllMessageStatesByThread',
                payload.request.threadId,
            ) as Array<{ messageId: string; data: Record<string, unknown> }>;

            const stateById: Record<string, Record<string, unknown>> = {};
            for (const ms of messageStates) {
                stateById[ms.messageId] = ms.data;
            }

            let compactionBaseIndex = -1;
            const branch = eventApi.result as Array<{ id: string }>;
            for (let i = branch.length - 1; i >= 0; i--) {
                const msgState = stateById[branch[i]!.id];
                const commands = msgState?.slashCommands as Array<{ name: string }> | undefined;
                if (commands?.some(c => c.name === 'compact')) {
                    compactionBaseIndex = i;
                    break;
                }
            }

            if (compactionBaseIndex === -1) return eventApi.result;
            return (eventApi.result as any[]).slice(compactionBaseIndex);
        });

        api.eventNode.hook('/warpcore', 'bridge.preConvertNewMsg', async (eventApi) => {
            const payload = eventApi.payload as {
                request: { messageState?: Record<string, unknown> };
            };

            const commands = payload.request.messageState?.slashCommands as Array<{ name: string }> | undefined;
            if (!commands?.some(c => c.name === 'compact')) {
                return eventApi.result;
            }

            const userMsg = eventApi.result as { content: Array<{ type: string; text?: string }> };
            for (const part of userMsg.content) {
                if (part.type === 'text') {
                    part.text = COMPACTION_PROMPT + part.text;
                    break;
                }
            }

            return eventApi.result;
        });

        api.eventNode.on('/warpcore', 'bridge.inference.finish', async (eventApi) => {
            const payload = eventApi.payload as {
                threadId: string;
                messageId: string;
                inferenceUrl: string;
                messages: Array<TOpenAIMessage>;
                message: IChatMessage,
            };
            const { threadId, messageId, inferenceUrl, messages, message } = payload;

            const threadState = await api.eventNode.invoke(
                '/warpcore',
                'bridge.getThreadState',
                threadId,
            ) as Record<string, unknown> | null;

            const guardrails = threadState?.guardrails as Record<string, IGuardrail> | undefined;
            if (!guardrails) return;

            const activeGuardrails = Object.values(guardrails).filter(g => g.isActive);
            if (!activeGuardrails.length) return;

            // Find current turn boundary
            const assistantIndex = messages.map(m => m.role).lastIndexOf('assistant');
            const beforePart3 = assistantIndex !== -1 ? messages.slice(0, assistantIndex) : messages;

            // Tool names from the assistant message
            const lastAssistant = messages[assistantIndex];
            const toolNames = lastAssistant?.tool_calls?.map(tc => tc.function.name.toLowerCase()) || [];

            // Filter guardrails by triggerOnTools
            const applicableGuardrails = activeGuardrails.filter(g => {
                if (!g.triggerOnTools) return true;
                const tools = g.triggerOnTools.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                if (!tools.length) return true;
                return tools.some(t => toolNames.includes(t));
            });
            if (!applicableGuardrails.length) return;

            // Immediately mark all as processing
            const initialResults: Record<string, boolean> = {};
            for (const g of applicableGuardrails) {
                initialResults[g.name] = false;
            }
            await api.eventNode.invoke('/warpcore', 'bridge.updateMessageState', {
                messageId,
                data: { guardrailResults: initialResults },
            });

            // Process one by one, save each result
            for (const guardrail of applicableGuardrails) {
                try {
                    const grServer = await store.get<IServer>('servers:' + guardrail.serverId);
                    if (!grServer) throw '[BEApplet] Guardrail server not found:' + guardrail.serverId;

                    const grInferenceUrl = `http://127.0.0.1:${grServer.port}` || inferenceUrl;

                    const toText = (m: TOpenAIMessage) => {
                        if (m.role === "system") {
                            if (m.content === "<base>") return `--- Conversation Root ---`;
                            else if (m.content === "<latest>") return `--- Recent Messages ---`;
                            else if (m.content === "<review>") return `--- Message to Review ---`;
                        }

                        const content = typeof m.content === 'string'
                            ? m.content
                            : Array.isArray(m.content)
                                ? m.content.find((c: any) => c.type === 'text')?.text || ''
                                : '';
                        let result = `[${m.role}]: ${content}`;
                        if (m.tool_calls?.length) {
                            result += '\n' + m.tool_calls.map(tc => `[${tc.function.name}]: ${tc.function.arguments}`).join('\n');
                        }
                        return result;
                    };

                    const part1: Array<TOpenAIMessage> = [];
                    const part2: Array<TOpenAIMessage> = [];
                    const part3: Array<TOpenAIMessage> = [];

                    // Part 3 - always included, just the assistant message
                    part3.push({ role: "system", content: "<review>" });
                    part3.push(messages[assistantIndex]!);

                    // Part 1 - base from beforePart3
                    if (guardrail.includeBaseMessage) {
                        if (beforePart3.length >= 1) {
                            part1.push({role: "system", content: "<base>"});
                            part1.push(beforePart3[0]!);
                        }
                        if (beforePart3.length >= 2) part1.push(beforePart3[1]!);
                    }

                    // Part 2 - last N from beforePart3
                    if (guardrail.messagesCount && guardrail.messagesCount > 0) {
                        part2.push({ role: "system", content: "<latest>" });
                        part2.push(...beforePart3.slice(-guardrail.messagesCount));
                    }

                    // Merge with dedup (part 1/2 can overlap)
                    const all = [...part1, ...part2, ...part3];
                    const seen = new Set<TOpenAIMessage>();
                    const context = all.filter(m => {
                        if (seen.has(m)) return false;
                        seen.add(m);
                        return true;
                    });
                    const contextTexts = context.map(toText);

                    const prompt = GUARDRAIL_PROMPT + GUARDRAIL_RULESET_GENERIC_PROMPT + '\n' + (guardrail.prompt || '')
                        + 'Conversation/Message is below -\n'
                        + contextTexts.join('\n');

                    const result = await api.eventNode.invoke('/warpcore', 'bridge.handlePureCompletion', {
                        inferenceRequestId: guardrail.name + '-' + messageId,
                        inferenceUrl: grInferenceUrl,
                        
                        messages: [{
                            role: 'user',
                            content: prompt,
                        }],

                        inferenceParams: {
                            ...GUARDRAILS_DEFAULT_INFERENCE_PARAMS,
                            ...guardrail.inferenceParams,
                        }
                    });

                    const text = result.content?.filter((c: any) => c.type === "text")?.[0]?.text || 'Error';
                    const parsed: IGuardrailIssue[] =JSON.parse(text);

                    // Read existing results, merge, save
                    const existing = (await api.eventNode.invoke('/warpcore', 'bridge.getMessageState', messageId)) as Record<string, unknown>;
                    const currentResults = (existing?.guardrailResults as Record<string, any>) || {};

                    await api.eventNode.invoke('/warpcore', 'bridge.updateMessageState', {
                        messageId,
                        data: { guardrailResults: { ...currentResults, [guardrail.name]: parsed } },
                    });
                } catch (err) {
                    console.error('[BEApplet] Guardrail error:', guardrail.name, err);
                }
            }
        });

    });
};

export const BEApplet: TAppletDefinition<IAppletAPIBE> = {
	name: 'BEApplet',
	description: 'Backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
