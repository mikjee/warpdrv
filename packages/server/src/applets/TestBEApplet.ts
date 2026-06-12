import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletApiBE } from './types';

const fn: IAppletFn<IAppletApiBE> = async (api: IAppletApiBE) => {
	console.log('[TestBEApplet] Started');
};

export const TestBEApplet: TAppletDefinition<IAppletApiBE> = {
	name: 'TestBE',
	description: 'Test backend applet',
	fn,
	hostType: EAppletHostType.BE,
	scope: EAppletScope.GLOBAL,
};
