import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletApiBE } from './types';

const fn: IAppletFn<IAppletApiBE> = async (api: IAppletApiBE) => {
    console.log('[TestBEApplet] Started');
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
                part.text = 'Summarize the thread. Include important details. Follow additional instructions as below - ' + part.text;
                break;
            }
        }

        return eventApi.result;
    });
};

export const TestBEApplet: TAppletDefinition<IAppletApiBE> = {
	name: 'TestBE',
	description: 'Test backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
