import React, { useState } from 'react';
import { Box, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import { List, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface INode { symbol: string; kind: string; filePath: string; startLine: number; }

const KIND_COLORS: Record<string, string> = {
	function: 'var(--wc-accent-blue)', class: 'var(--wc-accent-purple)', interface: 'var(--wc-accent-cyan)',
	type: 'var(--wc-accent-yellow-strong)', method: 'var(--wc-accent-blue)', variable: 'var(--wc-text-muted)', enum: 'var(--wc-accent-orange)',
};

export const CodeGraphListRenderer = React.memo((props: {
	path?: string; result?: unknown;
}) => {
	const { path, result } = props;
	const text = extractResultText(result);
	let nodes: INode[] | null = null;
	if (text) { try { const d = JSON.parse(text); nodes = Array.isArray(d?.results) ? d.results : null; } catch {} }
	const [expanded, setExpanded] = useState(false);

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={nodes?.length ? '2' : '0'}>
				<List size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)">{path ? String(path) : '(project root)'}</Text>
			</HStack>
			{nodes && nodes.length > 0 && (
				<Box>
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">{String(nodes.length)} symbol{nodes.length > 1 ? 's' : ''}</Text>
					</HStack>
					{expanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="300px">
							<VStack gap="1" align="stretch">
								{nodes.map((n, i) => (
									<HStack key={i} gap="2" align="center">
										<Badge fontSize="9px" color={KIND_COLORS[n.kind] ?? 'var(--wc-text-muted)'} bg="var(--wc-bg-surface)" px="1" py="0" minW="50px" textAlign="center">{String(n.kind)}</Badge>
										<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-primary)">{String(n.symbol)}</Text>
										<Box flex="1" />
										<Text fontSize="10px" fontFamily="mono" color="var(--wc-text-faint)">{String(n.filePath)}:{String(n.startLine)}</Text>
									</HStack>
								))}
							</VStack>
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
});

export const CodeGraphListRendererMeta: IToolCallRenderer = {
	component: CodeGraphListRenderer,
	keywords: ['code_graph_list'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const path = typeof args.path === 'string' ? args.path : undefined;
		if (path === undefined) return false;
		return { path };
	},
};
