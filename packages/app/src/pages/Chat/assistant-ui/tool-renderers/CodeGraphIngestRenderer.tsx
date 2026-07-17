import React from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { Database } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface IIngestStats {
	filesIndexed?: number;
	filesUpdated?: number;
	filesSkipped?: number;
	nodesCreated?: number;
	edgesCreated?: number;
}

export const CodeGraphIngestRenderer = React.memo((props: {
	force?: boolean;
	result?: unknown;
}) => {
	const { force, result } = props;
	const text = extractResultText(result);
	let stats: IIngestStats | null = null;
	if (text) {
		try { stats = JSON.parse(text); } catch {}
	}

	const statEntries = stats ? Object.entries(stats).filter(([, v]) => typeof v === 'number') as [keyof IIngestStats, number][] : [];
	const statLabels: Record<string, string> = { filesIndexed: 'Indexed', filesUpdated: 'Updated', filesSkipped: 'Skipped', nodesCreated: 'Nodes', edgesCreated: 'Edges' };

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={statEntries.length ? '2' : '0'}>
				<Database size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" color="var(--wc-text-primary)">{force ? 'Force re-index' : 'Incremental index'}</Text>
			</HStack>
			{statEntries.length > 0 && (
				<HStack gap="2" flexWrap="wrap">
					{statEntries.map(([key, value]) => (
						<Box key={key} bg="var(--wc-overlay-dim)" borderRadius="sm" px="2" py="1">
							<HStack gap="1">
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">{value}</Text>
								<Text fontSize="9px" color="var(--wc-text-faint)" textTransform="uppercase">{statLabels[key]}</Text>
							</HStack>
						</Box>
					))}
				</HStack>
			)}
		</Box>
	);
});

export const CodeGraphIngestRendererMeta: IToolCallRenderer = {
	component: CodeGraphIngestRenderer,
	keywords: ['code_graph_ingest'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const force = typeof args.force === 'boolean' ? args.force : undefined;
		return { force };
	},
};
