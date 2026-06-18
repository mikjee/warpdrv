import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletAPIBE } from '../lib/types';
import type { IGuardrail } from '@warpcore/shared';
import { COMPACTION_PROMPT } from './prompts';

const fn: IAppletFn<IAppletAPIBE> = async (api: IAppletAPIBE) => {
    console.log('[BEApplet] Started');

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
            const msgState = stateById[branch[i].id];
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

        const guardrailResults: Record<string, any> = {};
        for (const guardrail of Object.values(guardrails).filter(g => g.active)) {
            try {
                const result = await api.eventNode.invoke('/warpcore', 'bridge.handlePureCompletion', {
                    inferenceRequestId: guardrail.name + '-' + messageId,
                    inferenceUrl,
                    messages: [...messages, {
                        role: 'system',
                        content: guardrail.prompt || 'Review the assistant response.',
                    }],
                    inferenceParams: { temperature: 0.1, maxTokens: 512 },
                });
                guardrailResults[guardrail.name] = result;
            } catch (err) {
                console.error('[BEApplet] Guardrail error:', guardrail.name, err);
            }
        }
        if (Object.keys(guardrailResults).length) {
            await api.eventNode.invoke('/warpcore', 'bridge.updateMessageState', {
                messageId,
                data: { guardrails: guardrailResults },
            });
        }
    });
};

export const BEApplet: TAppletDefinition<IAppletAPIBE> = {
	name: 'BEApplet',
	description: 'Backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
