import React from 'react';
import { Box, Text, HStack, VStack, Link } from '@chakra-ui/react';
import { Search, ExternalLink } from 'lucide-react';
import { extractResultText } from './utils';

interface ISearchResult {
	title?: string;
	url?: string;
	snippet?: string;
	description?: string;
}

function parseSearchResults(text: string): ISearchResult[] | null {
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) return parsed as ISearchResult[];
		if (parsed && typeof parsed === 'object' && 'results' in parsed && Array.isArray(parsed.results)) {
			return parsed.results as ISearchResult[];
		}
		return null;
	} catch {
		return null;
	}
}

export const SearchRenderer = React.memo((props: {
	query?: string,
	result?: unknown,
}) => {
	const { query, result } = props;
	const resultText = extractResultText(result);
	const results = resultText ? parseSearchResults(resultText) : null;
	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb={results ? '2' : '0'}>
				<Search size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" color="var(--wc-text-primary)" wordBreak="break-word">
					{query ?? '(no query)'}
				</Text>
			</HStack>
			{results && results.length > 0 && (
				<VStack gap="2" align="stretch" bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="400px">
					{results.map((r, i) => (
						<Box key={i} pb="1" borderBottomWidth={i < results.length - 1 ? '1px' : '0'} borderColor="var(--wc-border-subtle)">
							<HStack gap="1" align="center" mb="0">
								{r.url && <ExternalLink size={10} color="var(--wc-text-faint)" />}
								{r.url ? (
									<Link href={r.url} target="_blank" fontSize="11px" color="var(--wc-accent-blue)" wordBreak="break-all">
										{r.title ?? r.url}
									</Link>
								) : (
									<Text fontSize="11px" color="var(--wc-text-primary)">{r.title}</Text>
								)}
							</HStack>
							{(r.snippet ?? r.description) && (
								<Text fontSize="10px" color="var(--wc-text-muted)" mt="0">
									{r.snippet ?? r.description}
								</Text>
							)}
						</Box>
					))}
				</VStack>
			)}
			{resultText && !results && (
				<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="300px">
					<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
						{resultText}
					</Text>
				</Box>
			)}
		</Box>
	);
});
