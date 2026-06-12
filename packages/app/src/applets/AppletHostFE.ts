import { AppletHost } from '@warpcore/realmcore';
import { useStore } from '@/store';
import type { ISlashCommand } from '@/store/slices/slashCommands';
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
		};
	}

	public override terminate(): Promise<void> {
		const tracked = useStore.getState().slashCommandsByApplet[this.definition.name];
		if (tracked) {
			for (const cmd of Object.keys(tracked)) {
				useStore.getState().unregisterSlashCommand(cmd, this.definition.name);
			}
		}
		return super.terminate();
	}
}
