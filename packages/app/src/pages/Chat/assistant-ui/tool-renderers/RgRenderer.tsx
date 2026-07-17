import React, { useState } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface IRgMatch { file: string; line: number; text: string; }

export const RgRenderer = React.memo((props: {
	pattern?: string; path?: string; type?: string; caseSensitive?: boolean;
	maxResults?: number; contextLines?: number; result?: unknown;
}) => {
	const { pattern, path, type, caseSensitive, result } = props;
	const text = extractResultText(result);
	let matches: IRgMatch[] | null = null;
	let truncated = false;
	if (text) {
		try {
			const d = JSON.parse(text);
			matches = Array.isArray(d?.matches) ? d.matches : null;
			truncated = !!d?.truncated;
		} catch {}
	}
	const [expanded, setExpanded] = useState(false);

	const bits: string[] = [];
	if (type) bits.push('type: ' + type);
	if (caseSensitive) bits.push('case-sensitive');

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={matches?.length ? '2' : '0'}>
				<Search size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)">
					<Text as="span" color="var(--wc-text-muted)">rg</Text> {String(pattern ?? '(no pattern)')}
				</Text>
				{path && <Text fontSize="10px" fontFamily="mono" color="var(--wc-text-faint)">{String(path)}</Text>}
				{bits.length > 0 && <Text fontSize="10px" color="var(--wc-text-faint)">{bits.join(' · ')}</Text>}
			</HStack>
			{matches && matches.length > 0 && (
				<Box>
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">{String(matches.length)} match{matches.length > 1 ? 'es' : ''}</Text>
						{truncated && <Text fontSize="10px" color="var(--wc-accent-yellow-strong)">truncated</Text>}
					</HStack>
					{expanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="300px">
							<VStack gap="1" align="stretch">
								{matches.map((m, i) => (
									<Box key={i}>
										<HStack gap="2" align="center">
											<Text fontSize="10px" fontFamily="mono" color="var(--wc-text-faint)" minW="30px">{String(m.line)}</Text>
											<Text fontSize="10px" fontFamily="mono" color="var(--wc-text-muted)">{String(m.file)}</Text>
										</HStack>
										<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-all" pl="5">{String(m.text)}</Text>
									</Box>
								))}
							</VStack>
						</Box>
					)}
				</Box>
			)}
		</Box>
	);
});

export const RgRendererMeta: IToolCallRenderer = {
	component: RgRenderer,
	keywords: ['rg', 'ripgrep', 'grep'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const pattern = typeof args.pattern === 'string' ? args.pattern : undefined;
		if (!pattern) return false;
		const path = typeof args.path === 'string' ? args.path : undefined;
		const type = typeof args.type === 'string' ? args.type : undefined;
		const caseSensitive = typeof args.caseSensitive === 'boolean' ? args.caseSensitive : undefined;
		const maxResults = typeof args.maxResults === 'number' ? args.maxResults : undefined;
		const contextLines = typeof args.contextLines === 'number' ? args.contextLines : undefined;
		return { pattern, path, type, caseSensitive, maxResults, contextLines };
	},
};
