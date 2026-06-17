import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from './lib/types';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { Box, Text } from '@chakra-ui/react';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
import React from 'react';

const TestPanel = () => (
	<Box p="4">
		<Text>Test Right Panel</Text>
	</Box>
);

const CompactIndicator = React.memo(({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
	const messageId = useAuiState(s => s.message.id);
	const slashCommands = useStore(s => s.messageStates[messageId]?.slashCommands);
	const hasCompact = (slashCommands as Array<IExtractedSlashCommand> | undefined)?.some(cmd => cmd.name === 'compact');

	if (!hasCompact) return children;
	return (
		<>
			<Box display="flex" alignItems="center" gap="2" mb="2">
				<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
				<Text fontSize="xs" fontWeight="600" color="var(--wc-accent-yellow-glow)" letterSpacing="0.1em">
					COMPACTION
				</Text>
				<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
			</Box>
			{children}
		</>
	);
});

const fn: IAppletFn<IAppletAPIFE> = async (api) => {
	console.log('[FEApplet] Started');
	api.registerSlashCommand({
		name: 'testfe',
		description: 'Test FE command with target and count params',
		params: {
			target: { type: 'string', description: 'Target name', index: 0 },
			count: { type: 'number', description: 'Count value', index: 1 },
		},
		execute: async (api, params) => { console.log('[FEApplet] /testfe executed', params); },
	});
	api.registerSlashCommand({
		name: 'testecho',
		description: 'Echo back whatever you type as a test',
		params: {
			message: { type: 'string', description: 'Message to echo', index: 0 },
		},
		execute: async (api, params) => { console.log('[FEApplet] /testecho executed', params); },
	});
	api.registerSlashCommand({
		name: 'compact',
		description: 'Compact the conversation thread',
		params: {},
		execute: async (api, params) => { console.log('[FEApplet] /compact executed'); },
	});
	api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, TestPanel, { label: 'FEApplet' });
	api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, CompactIndicator, { label: 'Compact Indicator' });
	api.registerComposerChip({
		label: 'FEApplet',
		isActive: true,
		onClose: (id) => { console.log('[FEApplet] chip closed', id); },
	});
};

export const FEApplet: TAppletDefinition<IAppletAPIFE> = {
	name: 'FEApplet',
	description: 'Frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
