import React, { useState } from 'react';
import { Box, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface INode { symbol: string; kind: string; filePath: string; startLine: number; }

const KIND_COLORS: Record<string, string> = {
	function: 'var(--wc-accent-blue)', class: 'var(--wc-accent-purple)', interface: 'var(--wc-accent-cyan)',
	type: 'var(--wc-accent-yellow-strong)', method: 'var(--wc-accent-blue)', variable: 'var(--wc-text-muted)', enum: 'var(--wc-accent-orange)',
};

export const CodeGraphSearchRenderer = React.memo((props: {
	query?: string; kind?: string; filePath?: string; limit?: number; result?: unknown;
}) => {
	const { query, kind, filePath, limit, result } = props;
	const text = extractResultText(result);
	let nodes: INode[] | null = null;
	if (text) { try { const d = JSON.parse(text); nodes = Array.isArray(d?.results) ? d.results : null; } catch {} }
	const [expanded, setExpanded] = useState(false);

	const bits: string[] = [];
	if (kind) bits.push(kind); if (filePath) bits.push(filePath); if (limit) bits.push(String(limit));

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={nodes?.length ? '2' : '0'}>
				<Search size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" color="var(--wc-text-primary)">{String(query ?? '(no query)')}</Text>
				{bits.length > 0 && <Text fontSize="10px" color="var(--wc-text-faint)">{bits.join(' · ')}</Text>}
			</HStack>
			{nodes && nodes.length > 0 && (
				<Box>
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">{String(nodes.length)} results</Text>
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

export const CodeGraphSearchRendererMeta: IToolCallRenderer = {
	component: CodeGraphSearchRenderer,
	keywords: ['code_graph_search'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const query = typeof args.query === 'string' ? args.query : undefined;
		if (!query) return false;
		const kind = typeof args.kind === 'string' ? args.kind : undefined;
		const filePath = typeof args.file_path === 'string' ? args.file_path : undefined;
		const limit = typeof args.limit === 'number' ? args.limit : undefined;
		return { query, kind, filePath, limit };
	},
};
