import type React from 'react';
import type { EventNode, TCallback } from '@warpcore/realmcore';
import type { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import type { TUISpaceComponentId, TUISpaceComponent } from '@/store/slices/uiSpaces';
import type { AppState } from '@/store/types';
import { TAppletBaseAPI } from '@warpcore/realmcore/src/applet/types';

export interface IAppletAPIFE extends TAppletBaseAPI {
	useStore: typeof useStore;

	registerSlashCommand: (command: ISlashCommand) => void;
	unregisterSlashCommand: (name: string) => void;
	
	registerUiSpaceComponent: (spaceId: string, component: TUISpaceComponent, opts: { label: string, componentId?: string, icon?: React.ComponentType<any> }) => TUISpaceComponentId;
	unregisterUiSpaceComponent: (id: TUISpaceComponentId) => void;
	registerComposerChip: (options: {
		componentId?: string;
		selectLabel: (state: AppState) => string;
		selectIsActive: (state: AppState) => boolean;
		onSetIsActive: (active: boolean) => void;
		onClose?: (id: string) => void;
		icon?: React.ComponentType<any>;
	}) => TUISpaceComponentId;
}
