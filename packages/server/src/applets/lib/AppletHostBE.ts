import { AppletHost } from '@warpcore/realmcore';
import type { IAppletAPIBE } from './types';

export class AppletHostBE extends AppletHost<IAppletAPIBE> {
	public override buildApi(): IAppletAPIBE {
		const api = super.buildApi();
		return { 
			...api, 
		};
	}
}
