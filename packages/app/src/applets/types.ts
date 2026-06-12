import type { EventNode } from '@warpcore/realmcore';
import type { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';

export interface IAppletApiFE {
	eventNode: EventNode;
	useStore: typeof useStore;
	registerSlashCommand: (command: ISlashCommand) => void;
	unregisterSlashCommand: (name: string) => void;
}
