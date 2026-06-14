import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletApiFE } from './types';
import { Box, Text } from '@chakra-ui/react';

const TestPanel = () => (
	<Box p="4">
		<Text>Test Right Panel</Text>
	</Box>
);

const fn: IAppletFn<IAppletApiFE> = async (api) => {
	console.log('[TestFEApplet] Started');
	api.registerSlashCommand({
		name: 'testfe',
		description: 'Test FE command',
		params: {
			target: { type: 'string', description: 'Target name', index: 0 },
			count: { type: 'number', description: 'Count value', index: 1 },
		},
		execute: async (params) => { console.log('[TestFEApplet] /testfe executed', params); },
	});
	api.registerUiSpaceComponent('right-panel', TestPanel);
};

export const TestFEApplet: TAppletDefinition<IAppletApiFE> = {
	name: 'TestFE',
	description: 'Test frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
