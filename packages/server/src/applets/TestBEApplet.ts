import type { TAppletDefinition, IAppletFn, IAppletApiBE } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';

const fn: IAppletFn<IAppletApiBE> = async (api: IAppletApiBE) => {
	console.log('[TestBEApplet] Started', api);
};

export const TestBEApplet: TAppletDefinition<IAppletApiBE> = {
	name: 'TestBE',
	description: 'Test backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
