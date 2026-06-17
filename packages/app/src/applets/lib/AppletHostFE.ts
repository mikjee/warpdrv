import { nanoid } from 'nanoid';
import { AppletHost } from '@warpcore/realmcore';
import { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { TUISpaceComponentId, TUISpaceComponent } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from './types';
import { UiSpaceChip } from '../ui/UiSpaceChip';

export class AppletHostFE extends AppletHost {
	public override buildApi(): IAppletAPIFE {
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
			registerUiSpaceComponent: (spaceId: string, component: TUISpaceComponent, opts: { label: string }) => {
				return useStore.getState().registerUiSpaceComponent({
					location: spaceId as EUISpaceLoc,
					component,
					label: opts.label,
					appletName,
				});
			},
			unregisterUiSpaceComponent: (id: TUISpaceComponentId) => {
				useStore.getState().unregisterUiSpaceComponent(appletName, id);
			},
			registerComposerChip: (options) => {
				const id = nanoid();
				return useStore.getState().registerUiSpaceComponent({
					componentId: id,
					location: EUISpaceLoc.COMPOSER,
					component: UiSpaceChip,
					label: 'UiSpaceChip',
					appletName,
					props: options,
				});
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
		state.unregisterUiSpaceComponent(this.definition.name);
		return super.terminate();
	}
}
