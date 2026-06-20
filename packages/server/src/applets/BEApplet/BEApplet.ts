import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletAPIBE } from '../lib/types';
import type { IGuardrail, IGuardrailIssue, IServer } from '@warpcore/shared';
import { COMPACTION_PROMPT, GUARDRAIL_PROMPT, GUARDRAIL_RULESET_GENERIC_PROMPT } from './prompts';
import { store } from '../../util/store';

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
                'bridge.getMessageStates',
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
                messages: Array<{ role: string; content: any }>;
            };
            const { threadId, messageId, inferenceUrl, messages } = payload;

            const threadState = await api.eventNode.invoke(
                '/warpcore',
                'bridge.getThreadState',
                threadId,
            ) as Record<string, unknown> | null;

            const guardrails = threadState?.guardrails as Record<string, IGuardrail> | undefined;
            if (!guardrails) return;

            const activeGuardrails = Object.values(guardrails).filter(g => g.active);
            if (!activeGuardrails.length) return;

            // Immediately mark all as processing
            const initialResults: Record<string, boolean> = {};
            for (const g of activeGuardrails) {
                initialResults[g.name] = false;
            }
            await api.eventNode.invoke('/warpcore', 'bridge.updateMessageState', {
                messageId,
                data: { guardrailResults: initialResults },
            });

            // Process one by one, save each result
            for (const guardrail of activeGuardrails) {
                try {
                    const grServer = await store.get<IServer>('servers:' + guardrail.serverId);
                    if (!grServer) {
                        console.warn('[BEApplet] Guardrail server not found:', guardrail.serverId);
                        continue;
                    }
                    const grInferenceUrl = `http://127.0.0.1:${grServer.port}`;
                    const result = await api.eventNode.invoke('/warpcore', 'bridge.handlePureCompletion', {
                        inferenceRequestId: guardrail.name + '-' + messageId,
                        inferenceUrl: grInferenceUrl,
                        messages: [...messages, {
                            role: 'system',
                            content: GUARDRAIL_PROMPT + GUARDRAIL_RULESET_GENERIC_PROMPT + (guardrail.prompt || ''),
                        }],
                        inferenceParams: { temperature: 0.1, maxTokens: 512 },
                    });
                    const text = result.content?.[0]?.text || '[]';
                    let parsed: IGuardrailIssue[] = [];
                    try {
                        parsed = JSON.parse(text);
                    } catch {
                        // If not valid JSON, treat as clean
                    }
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
