import React, { useState } from 'react';
import { Box, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import { GitPullRequest, ChevronDown, ChevronRight, Check, AlertTriangle } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface INode { symbol: string; kind: string; filePath: string; startLine: number; resolved?: boolean; }

const KIND_COLORS: Record<string, string> = {
	function: 'var(--wc-accent-blue)', class: 'var(--wc-accent-purple)', interface: 'var(--wc-accent-cyan)',
	type: 'var(--wc-accent-yellow-strong)', method: 'var(--wc-accent-blue)', variable: 'var(--wc-text-muted)', enum: 'var(--wc-accent-orange)',
};

export const CodeGraphCallersRenderer = React.memo((props: {
	symbolId?: string; symbol?: string; depth?: number; result?: unknown;
}) => {
	const { symbolId, symbol, depth, result } = props;
	const text = extractResultText(result);
	let nodes: INode[] | null = null;
	if (text) { try { const d = JSON.parse(text); nodes = Array.isArray(d?.results) ? d.results : null; } catch {} }
	const [expanded, setExpanded] = useState(false);
	const target = symbolId ?? symbol ?? '(no symbol)';

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={nodes?.length ? '2' : '0'}>
				<GitPullRequest size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)">{String(target)}</Text>
				<Text fontSize="10px" color="var(--wc-text-faint)">callers</Text>
				{depth && depth > 1 && <Text fontSize="10px" color="var(--wc-text-faint)">depth: {depth}</Text>}
			</HStack>
			{nodes && nodes.length > 0 && (
				<Box>
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">{String(nodes.length)} caller{nodes.length > 1 ? 's' : ''}</Text>
					</HStack>
					{expanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="300px">
							<VStack gap="1" align="stretch">
								{nodes.map((n, i) => (
									<HStack key={i} gap="2" align="center">
										{n.resolved !== false ? <Check size={10} color="var(--wc-accent-green-icon)" /> : <AlertTriangle size={10} color="var(--wc-accent-yellow-strong)" />}
										<Badge fontSize="9px" color={KIND_COLORS[n.kind] ?? 'var(--wc-text-muted)'} bg="var(--wc-bg-surface)" px="1" py="0" minW="40px" textAlign="center">{String(n.kind)}</Badge>
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

export const CodeGraphCallersRendererMeta: IToolCallRenderer = {
	component: CodeGraphCallersRenderer,
	keywords: ['code_graph_callers'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const symbolId = typeof args.symbol_id === 'string' ? args.symbol_id : undefined;
		const symbol = typeof args.symbol === 'string' ? args.symbol : undefined;
		if (!symbolId && !symbol) return false;
		const depth = typeof args.depth === 'number' ? args.depth : undefined;
		return { symbolId, symbol, depth };
	},
};
