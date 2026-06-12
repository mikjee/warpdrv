import { AppletHost } from './AppletHost';
import type { IAppletApiFE } from './types';

export class AppletHostFE extends AppletHost {
	public override buildApi(): IAppletApiFE {
		return { 
			eventNode: this.eventNode 
		};
	}
}
