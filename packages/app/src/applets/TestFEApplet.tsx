import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import type { IAppletApiFE } from './types';
import { Box, Text } from '@chakra-ui/react';

const TestPanel = () => (
	<Box p="4">
		<Text>Test Right Panel</Text>
	</Box>
);

const TestComposerChip = () => (
	<Text fontSize="xs" fontWeight="500" color="var(--wc-text-primary)">
		TestFE
	</Text>
);

const fn: IAppletFn<IAppletApiFE> = async (api) => {
	console.log('[TestFEApplet] Started');
	api.registerSlashCommand({
		name: 'testfe',
		description: 'Test FE command with target and count params',
		params: {
			target: { type: 'string', description: 'Target name', index: 0 },
			count: { type: 'number', description: 'Count value', index: 1 },
		},
		execute: async (api, params) => { console.log('[TestFEApplet] /testfe executed', params); },
	});
	api.registerSlashCommand({
		name: 'testecho',
		description: 'Echo back whatever you type as a test',
		params: {
			message: { type: 'string', description: 'Message to echo', index: 0 },
		},
		execute: async (api, params) => { console.log('[TestFEApplet] /testecho executed', params); },
	});
	api.registerUiSpaceComponent('right-panel', TestPanel, { componentName: 'TestFE' });
	api.registerUiSpaceComponent('composer', TestComposerChip, { componentName: 'TestFE' });
};

export const TestFEApplet: TAppletDefinition<IAppletApiFE> = {
	name: 'TestFE',
	description: 'Test frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
