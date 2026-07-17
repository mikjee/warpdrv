import React from 'react';
import { Box, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import { FileCode } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface INode { symbol: string; kind: string; language: string; filePath: string; startLine: number; endLine: number; signature?: string; }

const KIND_COLORS: Record<string, string> = {
	function: 'var(--wc-accent-blue)', class: 'var(--wc-accent-purple)', interface: 'var(--wc-accent-cyan)',
	type: 'var(--wc-accent-yellow-strong)', method: 'var(--wc-accent-blue)', variable: 'var(--wc-text-muted)', enum: 'var(--wc-accent-orange)',
};

export const CodeGraphSymbolRenderer = React.memo((props: {
	symbolId?: string; symbol?: string; result?: unknown;
}) => {
	const { symbolId, symbol, result } = props;
	const text = extractResultText(result);
	let nodes: INode[] | null = null;
	if (text) {
		try {
			const d = JSON.parse(text);
			const r = d?.result ?? d;
			if (Array.isArray(r)) nodes = r;
			else if (r && typeof r === 'object') nodes = [r];
		} catch {}
	}
	const label = symbolId ?? symbol ?? '(no symbol)';

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={nodes?.length ? '2' : '0'}>
				<FileCode size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)">{String(label)}</Text>
			</HStack>
			{nodes && nodes.length > 0 && (
				<VStack gap="2" align="stretch">
					{nodes.map((n, i) => (
						<Box key={i} bg="var(--wc-overlay-dim)" borderRadius="sm" p="2">
							<HStack gap="2" align="center" mb={n.signature ? '1' : '0'}>
								<Badge fontSize="9px" color={KIND_COLORS[n.kind] ?? 'var(--wc-text-muted)'} bg="var(--wc-bg-surface)" px="1" py="0">{String(n.kind)}</Badge>
								<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)">{String(n.symbol)}</Text>
								<Text fontSize="10px" fontFamily="mono" color="var(--wc-text-faint)">{String(n.language)}</Text>
							</HStack>
							{n.signature && <Text fontSize="10px" fontFamily="mono" color="var(--wc-text-muted)" whiteSpace="pre-wrap" wordBreak="break-all" mb="1">{String(n.signature)}</Text>}
							<Text fontSize="10px" fontFamily="mono" color="var(--wc-text-faint)">{String(n.filePath)}:{String(n.startLine)}-{String(n.endLine)}</Text>
						</Box>
					))}
					{nodes.length > 1 && <Text fontSize="10px" color="var(--wc-text-faint)" fontStyle="italic">{nodes.length} matches — ambiguous symbol name</Text>}
				</VStack>
			)}
		</Box>
	);
});

export const CodeGraphSymbolRendererMeta: IToolCallRenderer = {
	component: CodeGraphSymbolRenderer,
	keywords: ['code_graph_symbol'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const symbolId = typeof args.symbol_id === 'string' ? args.symbol_id : undefined;
		const symbol = typeof args.symbol === 'string' ? args.symbol : undefined;
		if (!symbolId && !symbol) return false;
		return { symbolId, symbol };
	},
};
