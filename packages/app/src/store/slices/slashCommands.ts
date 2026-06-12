import type { AppState, ImmerSet, ImmerGet } from '../types';

export interface ISlashCommandParam {
	type: string;
	description: string;
	index: number;
}

export interface ISlashCommand {
	name: string;
	description: string;
	params: Record<string, ISlashCommandParam>;
	execute: (params: Record<string, unknown>) => Promise<void>;
}

interface SlashCommandsSlice {
	slashCommands: Record<string, ISlashCommand>;
	slashCommandsByApplet: Record<string, Record<string, true>>;
	registerSlashCommand: (command: ISlashCommand, appletName?: string) => void;
	unregisterSlashCommand: (name: string, appletName?: string) => void;
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
