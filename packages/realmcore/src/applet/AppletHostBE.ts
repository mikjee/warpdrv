import { AppletHost } from './AppletHost';
import type { IAppletApiBE } from './types';

export class AppletHostBE extends AppletHost {
	public override buildApi(): IAppletApiBE {
		return { eventNode: this.eventNode! };
	}
}
