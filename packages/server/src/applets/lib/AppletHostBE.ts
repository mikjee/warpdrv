import { AppletHost } from '@warpcore/realmcore';
import type { IAppletAPIBE } from './types';

export class AppletHostBE extends AppletHost {
	public override buildApi(): IAppletAPIBE {
		return { eventNode: this.eventNode! };
	}
}
