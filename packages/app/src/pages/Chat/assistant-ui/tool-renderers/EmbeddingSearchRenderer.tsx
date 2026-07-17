import React, { useState } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface IEmbeddingResult { messageId: string; text: string; distance: number; }

export const EmbeddingSearchRenderer = React.memo((props: {
	query?: string; topK?: number; topic?: string; result?: unknown;
}) => {
	const { query, topK, topic, result } = props;
	const text = extractResultText(result);
	let results: IEmbeddingResult[] | null = null;
	if (text) { try { const d = JSON.parse(text); results = Array.isArray(d?.results) ? d.results : null; } catch {} }
	const [expanded, setExpanded] = useState(false);

	const bits: string[] = [];
	if (topic) bits.push('topic: ' + topic);
	if (topK) bits.push('topK: ' + topK);

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={results?.length ? '2' : '0'}>
				<Search size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" color="var(--wc-text-primary)">{String(query ?? '(no query)')}</Text>
				{bits.length > 0 && <Text fontSize="10px" color="var(--wc-text-faint)">{bits.join(' · ')}</Text>}
			</HStack>
			{results && results.length > 0 && (
				<Box>
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">{String(results.length)} result{results.length > 1 ? 's' : ''}</Text>
					</HStack>
					{expanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="400px">
							<VStack gap="2" align="stretch">
								{results.map((r, i) => {
									const similarity = Math.round((1 - r.distance) * 100);
									return (
										<Box key={i} pb={i < results.length - 1 ? '2' : '0'} borderBottomWidth={i < results.length - 1 ? '1px' : '0'} borderColor="var(--wc-border-subtle)">
											<HStack gap="2" align="center" mb="1">
												<Text fontSize="10px" fontFamily="mono" color="var(--wc-accent-blue)" minW="45px">{similarity}%</Text>
												<Text fontSize="9px" fontFamily="mono" color="var(--wc-text-faint)">{String(r.messageId).slice(0, 8)}</Text>
											</HStack>
											<Text fontSize="11px" color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-word">{String(r.text)}</Text>
										</Box>
									);
								})}
							</VStack>
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
});

export const EmbeddingSearchRendererMeta: IToolCallRenderer = {
	component: EmbeddingSearchRenderer,
	keywords: ['embedding_search'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const query = typeof args.query === 'string' ? args.query : undefined;
		if (!query) return false;
		const topK = typeof args.topK === 'number' ? args.topK : undefined;
		const topic = typeof args.topic === 'string' ? args.topic : undefined;
		return { query, topK, topic };
	},
};
