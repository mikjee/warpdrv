import type { AppState, ImmerSet, ImmerGet } from '../types';
import type { ISlashCommandApi } from '@/hooks/useSlashCommandProcessor';

export interface ISlashCommandParam {
	type: string;
	description: string;
	index: number;
	props?: Record<string, unknown>;
}

export interface ISlashCommand {
	name: string;
	description: string;
	params: Record<string, ISlashCommandParam>;
	tags?: string[];
	execute: (api: ISlashCommandApi, params: Record<string, string | number>, extraParams?: Record<string, string>) => Promise<void>;
}

export const slashCommandsSlice = (
	setState: ImmerSet<AppState>,
	_getState: ImmerGet<AppState>,
): Partial<AppState> => ({
	slashCommands: {},
	slashCommandsByApplet: {},
	registerSlashCommand: (command, appletName) => {
		setState(draft => {
			draft.slashCommands[command.name] = command;
			if (appletName) {
				if (!draft.slashCommandsByApplet[appletName]) {
					draft.slashCommandsByApplet[appletName] = {};
				}
				draft.slashCommandsByApplet[appletName][command.name] = true;
			}
		});
	},
	unregisterSlashCommand: (name, appletName) => {
		setState(draft => {
			delete draft.slashCommands[name];
			if (appletName && draft.slashCommandsByApplet[appletName]) {
				delete draft.slashCommandsByApplet[appletName][name];
			}
		});
	},
});
