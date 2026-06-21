import { useCallback } from 'react';
import { useStore } from '@/store';

export interface ISlashCommandApi {
}

export function useSlashCommandProcessor() {
    const executeCommands = useCallback(async (extraParams?: Record<string, string>) => {
        const state = useStore.getState();
        const commands = state.pendingSlashCommands;
        if (!commands.length) return;
for (const cmd of commands) {
			const registered = state.slashCommands[cmd.name];
			if (registered) {
				const api: ISlashCommandApi = {};
				try {
					await registered.execute(api, cmd.params, extraParams);
				} catch (err) {
					console.error('[useSlashCommandProcessor] execute failed:', cmd.name, err);
				}
			}
		}
    }, []);

    return executeCommands;
}
