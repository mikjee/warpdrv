import { AppletHost } from './AppletHost';
import type { IAppletApiFE } from './types';

export class AppletHostFE extends AppletHost {
	public override buildApi(): IAppletApiFE {
		if (typeof window !== 'undefined') {
			(window as any).eventNode = this.eventNode;
		}
		return { eventNode: this.eventNode! };
	}
}
