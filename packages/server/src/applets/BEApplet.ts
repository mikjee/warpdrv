import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletAPIBE } from './lib/types';

const COMPACTION_PROMPT = `You are summarizing a conversation before its context is truncated. Capture everything needed to resume seamlessly. Adapt depth to the content - include the coding sections only if the session involved code. Do not ask any additional clarifying questions or make any conversation - this is strictly a summarization request.

## Topic / Task
The goal and current objective.

## State / Key points
What's been done, established, or exchanged; what works and is verified.

## Files (if code)
Each file touched: path, what changed, why.

## Decisions
Key technical or directional choices and rationale.

## Open threads / Pending
Unresolved questions, known bugs, next steps in order.

## Context
Conventions, constraints, env details, user goals and preferences affecting future work.

Be precise and factual. Preserve exact paths, names, commands, numbers, and error messages verbatim. Omit filler. Don't speculate about work not actually done. 

Additionally, follow below instructions, if any, for generating the summary.
`;

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
};

export const BEApplet: TAppletDefinition<IAppletAPIBE> = {
	name: 'BEApplet',
	description: 'Backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
