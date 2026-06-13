import { AppletHost } from '@warpcore/realmcore';
import { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import type { TUiSpaceId, TUiSpaceComponentId, TUiSpaceComponent } from '@/store/slices/uiSpaces';
import type { IAppletApiFE } from './types';

export class AppletHostFE extends AppletHost {
	public override buildApi(): IAppletApiFE {
		if (typeof window !== 'undefined') {
			(window as any).eventNode = this.eventNode;
		}
		const appletName = this.definition.name;
		return {
			eventNode: this.eventNode!,
			useStore,
			registerSlashCommand: (command: ISlashCommand) => {
				useStore.getState().registerSlashCommand(command, appletName);
			},
			unregisterSlashCommand: (name: string) => {
				useStore.getState().unregisterSlashCommand(name, appletName);
			},
			registerUiSpaceComponent: (spaceId: TUiSpaceId, component: TUiSpaceComponent) => {
				return useStore.getState().registerUiSpaceComponent(spaceId, component, appletName);
			},
			unregisterUiSpaceComponent: (id: TUiSpaceComponentId) => {
				useStore.getState().unregisterUiSpaceComponent(id, appletName);
			},
		};
	}

	public override terminate(): Promise<void> {
		const state = useStore.getState();
		const tracked = state.slashCommandsByApplet[this.definition.name];
		if (tracked) {
			for (const cmd of Object.keys(tracked)) {
				state.unregisterSlashCommand(cmd, this.definition.name);
			}
		}
		const trackedComponents = state.uiSpaceComponentsByApplet[this.definition.name];
		if (trackedComponents) {
			for (const entryId of Object.keys(trackedComponents)) {
				state.unregisterUiSpaceComponent(entryId, this.definition.name);
			}
		}
		return super.terminate();
	}
}
