import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Box, Flex, Input, Text } from '@chakra-ui/react';
import { SearchIcon, XIcon } from 'lucide-react';
import { searchChatMessages } from '@/api/services';
import type { ISearchResult } from '@warpcore/bridge';

// ============================================================
// Types
// ============================================================

interface SearchResultEntry {
	type: 'message' | 'thread';
	threadId: string;
	threadTitle: string;
	messageId?: string;
	snippet?: string;
	role?: string;
	createdAt: number;
}

// ============================================================
// Helpers
// ============================================================

function timeAgo(ts: number): string {
	const diff = Date.now() - ts;
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'now';
	if (mins < 60) return `${mins}m`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d`;
	return `${Math.floor(days / 30)}mo`;
}

function renderSnippet(text: string): React.ReactNode {
	const parts = text.split(/(<mark>|<\/mark>)/g);
	const elements: React.ReactNode[] = [];
	let inMark = false;
	let elemIdx = 0;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part === '<mark>') { inMark = true; continue; }
		if (part === '</mark>') { inMark = false; continue; }
		if (!part) continue;
		if (inMark) {
			elements.push(<mark key={elemIdx++} style={{ background: 'var(--wc-accent-yellow-hover-bg)', color: 'var(--wc-accent-yellow-strong)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>);
		} else {
			elements.push(<span key={elemIdx++}>{part}</span>);
		}
	}
	return elements;
}

// ============================================================
// ThreadSearchPanel
// ============================================================

export function ThreadSearchPanel({ threadId }: { threadId: string | null }) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResultEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear on thread switch
	useLayoutEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		setQuery('');
		setResults([]);
		setIsLoading(false);
	}, [threadId]);

	// Debounced search
	const handleSearch = useCallback((q: string) => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (!q.trim()) {
			setResults([]);
			setIsLoading(false);
			return;
		}
		timerRef.current = setTimeout(async () => {
			setIsLoading(true);
			try {
				const res = await searchChatMessages(q, 'thread', { threadId, limit: 50 });
				if (res.ok && res.data) {
					const entries: SearchResultEntry[] = res.data.map((item: ISearchResult) =>
						item as unknown as SearchResultEntry
					);
					setResults(entries);
				} else {
					setResults([]);
				}
			} catch {
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		}, 300);
	}, [threadId]);

	const handleResultClick = (result: SearchResultEntry) => {
		if (result.messageId) {
			setTimeout(() => {
				const el = document.querySelector(`[data-message-id="${result.messageId}"]`) as HTMLElement | null;
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 100);
		}
	};

	const hasQuery = query.trim().length > 0;

	return (
		<Box h="full" display="flex" flexDirection="column">
			<Flex alignItems="center" gap="2" px="3" py="2" borderBottom="1px solid var(--wc-border-subtle)">
				<SearchIcon size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
				<Input
					variant="subtle"
					placeholder="Search in thread..."
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						handleSearch(e.target.value);
					}}
					bg="transparent"
					color="var(--wc-text-primary)"
					fontSize="13px"
					h="28px"
					border="none"
					_focus={{ borderColor: 'transparent', outline: 'none', boxShadow: 'none' }}
				/>
				{query && (
					<Box as="button" cursor="pointer" opacity={0.4} _hover={{ opacity: 0.7 }} onClick={() => {
						setQuery('');
						setResults([]);
						setIsLoading(false);
					}}>
						<XIcon size={14} />
					</Box>
				)}
			</Flex>

			<Box flex="1" overflowY="auto" py="2" css={{
				'&::-webkit-scrollbar': { width: '4px' },
				'&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
			}}>
				{isLoading && results.length === 0 && (
					<Flex justifyContent="center" py="8">
						<Box w="20px" h="20px" borderRadius="full" border="2px solid var(--wc-text-disabled)" borderTopColor="var(--wc-accent-blue)" animation="spin 0.6s linear infinite" />
					</Flex>
				)}

				{!isLoading && hasQuery && results.length === 0 && (
					<Flex justifyContent="center" py="8">
						<Text fontSize="13px" color="var(--wc-text-muted)">No results</Text>
					</Flex>
				)}

				{!hasQuery && !isLoading && (
					<Flex justifyContent="center" py="8">
						<Text fontSize="13px" color="var(--wc-text-disabled)">Type to search this chat</Text>
					</Flex>
				)}

				{!threadId && (
					<Flex justifyContent="center" py="8">
						<Text fontSize="13px" color="var(--wc-text-disabled)">No chat selected</Text>
					</Flex>
				)}

				{results.map((result, idx) => (
					<Box
						key={idx}
						px="3"
						py="2"
						cursor="pointer"
						borderRadius="md"
						mx="1"
						_hover={{ bg: 'var(--wc-bg-hover)' }}
						onClick={() => handleResultClick(result)}
					>
						{result.type === 'message' && (
							<Flex flexDirection="column" gap="0.5">
								<Flex alignItems="flex-start" gap="1.5">
									<Text fontSize="12px" opacity={0.5} mt="1">💬</Text>
									<Text fontSize="12px" color="var(--wc-text-primary)" lineClamp={2} overflow="hidden">
										{result.snippet ? renderSnippet(result.snippet) : result.threadTitle}
									</Text>
								</Flex>
								<Text fontSize="11px" color="var(--wc-text-muted)" ml="5">
									{result.role} • {timeAgo(result.createdAt)}
								</Text>
							</Flex>
						)}
					</Box>
				))}
			</Box>

			{results.length > 0 && (
				<Flex justifyContent="space-between" alignItems="center" px="3" py="1.5" borderTop="1px solid var(--wc-border-subtle)">
					<Text fontSize="11px" color="var(--wc-text-muted)">{results.length} result{results.length > 1 ? 's' : ''}</Text>
				</Flex>
			)}
		</Box>
	);
}
