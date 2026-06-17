import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
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
	api.registerSlashCommand({
		name: 'compact',
		description: 'Compact the conversation thread',
		params: {},
		execute: async (api, params) => { console.log('[TestFEApplet] /compact executed'); },
	});
	api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, TestPanel, { label: 'TestFE' });
	api.registerComposerChip({
		label: 'TestFE',
		isActive: true,
		onClose: (id) => { console.log('[TestFEApplet] chip closed', id); },
	});
};

export const TestFEApplet: TAppletDefinition<IAppletApiFE> = {
	name: 'TestFE',
	description: 'Test frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
