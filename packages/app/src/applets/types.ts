import type { EventNode } from '@warpcore/realmcore';
import type { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import type { TUiSpaceId, TUiSpaceComponentId, TUiSpaceComponent } from '@/store/slices/uiSpaces';

export interface IAppletApiFE {
	eventNode: EventNode;
	useStore: typeof useStore;
	registerSlashCommand: (command: ISlashCommand) => void;
	unregisterSlashCommand: (name: string) => void;
	registerUiSpaceComponent: (spaceId: TUiSpaceId, component: TUiSpaceComponent, opts: { componentName: string }) => TUiSpaceComponentId;
	unregisterUiSpaceComponent: (id: TUiSpaceComponentId) => void;
}
