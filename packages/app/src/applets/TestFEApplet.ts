import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletApiFE } from './types';

const fn: IAppletFn<IAppletApiFE> = async (api) => {
	console.log('[TestFEApplet] Started');
	api.registerSlashCommand({
		name: 'testfe',
		description: 'Test FE command',
		params: {},
		execute: async () => { console.log('[TestFEApplet] /testfe executed'); },
	});
};

export const TestFEApplet: TAppletDefinition<IAppletApiFE> = {
	name: 'TestFE',
	description: 'Test frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
