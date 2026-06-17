import type { EventNode } from '@warpcore/realmcore';
import type { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import type { TUISpaceComponentId, TUISpaceComponent } from '@/store/slices/uiSpaces';

export interface IAppletAPIFE {
	eventNode: EventNode;
	useStore: typeof useStore;
	registerSlashCommand: (command: ISlashCommand) => void;
	unregisterSlashCommand: (name: string) => void;
	registerUiSpaceComponent: (spaceId: string, component: TUISpaceComponent, opts: { label: string }) => TUISpaceComponentId;
	unregisterUiSpaceComponent: (id: TUISpaceComponentId) => void;
	registerComposerChip: (options: {
		label: string;
		isActive: boolean;
		onClose?: (id: string) => void;
	}) => TUISpaceComponentId;
}
