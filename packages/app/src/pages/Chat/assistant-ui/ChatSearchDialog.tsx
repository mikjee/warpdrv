import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, Text, Input, Portal } from '@chakra-ui/react';
import { XIcon, SearchIcon } from 'lucide-react';
import { useStore } from '@/store';
import { searchChatMessages } from '@/api/services';
import type { ISearchResult, ISearchThreadResult } from '@warpcore/bridge';

// ============================================================
// Types
// ============================================================

type SearchMode = 'everywhere' | 'threads' | 'thread';

interface SearchResultEntry {
	type: 'message' | 'thread';
	threadId: string;
	threadTitle: string;
	messageId?: string;
	snippet?: string;
	role?: string;
	createdAt: number;
	matchCount?: number;
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

function highlightText(text: string, query: string): React.ReactNode {
	if (!query || !query.trim()) return text;
	const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
	const elements: React.ReactNode[] = [];
	let idx = 0;
	for (const part of parts) {
		if (part.toLowerCase() === query.toLowerCase()) {
			elements.push(<mark key={idx++} style={{ background: 'var(--wc-accent-blue-bg-12)', color: 'var(--wc-accent-blue)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>);
		} else {
			elements.push(part);
		}
	}
	return elements;
}

function renderSnippet(text: string): React.ReactNode {
	const parts = text.split(/(<mark>|<\/mark>)/g);
	const elements: React.ReactNode[] = [];
	let inMark = false;
	let elemIdx = 0;
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part === '<mark>') {
			inMark = true;
			continue;
		}
		if (part === '</mark>') {
			inMark = false;
			continue;
		}
		if (!part) continue;
		if (inMark) {
			elements.push(<mark key={elemIdx++} style={{ background: 'var(--wc-accent-blue-bg-12)', color: 'var(--wc-accent-blue)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>);
		} else {
			elements.push(<span key={elemIdx++}>{part}</span>);
		}
	}
	return elements;
}

// ============================================================
// ChatSearchDialog
// ============================================================

export function ChatSearchDialog({ isOpen, onClose, currentThreadId }: { isOpen: boolean; onClose: () => void; currentThreadId: string | null | undefined }) {
	const [query, setQuery] = useState('');
	const [mode, setMode] = useState<SearchMode>('everywhere');
	const [results, setResults] = useState<SearchResultEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(-1);
	const [hasSearched, setHasSearched] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);

	// Focus input on open
	useEffect(() => {
		if (isOpen) {
			setQuery('');
			setResults([]);
			setSelectedIndex(-1);
			setHasSearched(false);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [isOpen]);

	// Debounced search
	const performSearch = useCallback(async (q: string, m: SearchMode) => {
		if (!q.trim()) {
			setResults([]);
			setHasSearched(true);
			return;
		}
		setIsLoading(true);
		setHasSearched(true);
		try {
			const opts = { threadId: currentThreadId ?? undefined, limit: 50 };
			const res = await searchChatMessages(q, m, opts);
			if (res.ok && res.data) {
				const entries: SearchResultEntry[] = res.data.map((item: ISearchResult | ISearchThreadResult) => {
					if ('matchCount' in item) {
						return {
							type: 'thread' as const,
							threadId: item.threadId,
							threadTitle: item.threadTitle,
							createdAt: item.lastMatchAt,
							matchCount: item.matchCount,
						};
					}
					return item as unknown as SearchResultEntry;
				});
				setResults(entries);
			} else {
				setResults([]);
			}
		} catch {
			setResults([]);
		} finally {
			setIsLoading(false);
		}
	}, [currentThreadId]);

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (!query.trim()) {
			setResults([]);
			setHasSearched(false);
			setIsLoading(false);
			return;
		}
		timerRef.current = setTimeout(() => {
			performSearch(query, mode);
		}, 500);
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [query, mode, performSearch]);

	// Keyboard navigation
	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				setSelectedIndex(prev => Math.max(prev - 1, 0));
				return;
			}
			if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < results.length) {
				e.preventDefault();
				handleResultClick(results[selectedIndex]);
				return;
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [isOpen, results, selectedIndex, onClose]);

	const handleResultClick = (result: SearchResultEntry) => {
		onClose();
		setQuery('');
		setResults([]);
		setSelectedIndex(-1);
		setHasSearched(false);

		if (result.type === 'thread' || !result.messageId) {
			setCurrentThreadId(result.threadId);
			return;
		}

		// Navigate to thread, then scroll to message
		setCurrentThreadId(result.threadId);
		setTimeout(() => {
			const el = document.querySelector(`[data-message-id="${result.messageId}"]`) as HTMLElement | null;
			if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}, 300);
	};

	const tabs: { key: SearchMode; label: string; disabled?: boolean }[] = [
		{ key: 'everywhere', label: 'Everywhere' },
		{ key: 'threads', label: 'Threads' },
		{ key: 'thread', label: 'This chat', disabled: !currentThreadId },
	];

	if (!isOpen) return null;

	return (
		<Portal>
			<Box
				position="fixed"
				top="0"
				left="0"
				right="0"
				bottom="0"
				bg="var(--wc-overlay-modal)"
				zIndex={10000}
				display="flex"
				alignItems="center"
				justifyContent="center"
				onClick={onClose}
			>
				<Box
					w="640px"
					maxH="70vh"
					bg="var(--wc-bg-elevated)"
					borderWidth="1px"
					borderColor="var(--wc-border-overlay)"
					borderRadius="lg"
					shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
					display="flex"
					flexDirection="column"
					onClick={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						if (e.key === 'Escape') onClose();
					}}
				>
					{/* Header — search input */}
					<Flex
						alignItems="center"
						gap="2"
						px="4"
						py="3"
						borderBottom="1px solid var(--wc-border-subtle)"
					>
						<SearchIcon size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
						<Input
							ref={inputRef}
							variant="subtle"
							placeholder="Search..."
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								setSelectedIndex(-1);
							}}
							bg="transparent"
							color="var(--wc-text-primary)"
							fontSize="14px"
							h="32px"
							border="none"
							_focus={{ borderColor: 'transparent', outline: 'none', boxShadow: 'none' }}
						/>
						<Box
							as="button"
							cursor="pointer"
							opacity={0.4}
							_hover={{ opacity: 0.7 }}
							onClick={onClose}
						>
							<XIcon size={16} />
						</Box>
					</Flex>

					{/* Tabs */}
					<Flex
						px="4"
						py="2"
						gap="1"
						borderBottom="1px solid var(--wc-border-subtle)"
					>
						{tabs.map(tab => (
							<Box
								key={tab.key}
								as="button"
								px="3"
								py="1"
								borderRadius="md"
								fontSize="12px"
								fontWeight="500"
								cursor={tab.disabled ? 'not-allowed' : 'pointer'}
								bg={mode === tab.key ? 'var(--wc-bg-active)' : 'transparent'}
								color={tab.disabled ? 'var(--wc-text-disabled)' : mode === tab.key ? 'var(--wc-text-primary)' : 'var(--wc-text-muted)'}
								_hover={!tab.disabled ? { bg: 'var(--wc-bg-hover)' } : {}}
								onClick={() => {
									if (!tab.disabled) {
										setMode(tab.key);
										setSelectedIndex(-1);
									}
								}}
							>
								{tab.label}
							</Box>
						))}
					</Flex>

					{/* Results */}
					<Box
						flex="1"
						overflowY="auto"
						py="2"
						css={{
							'&::-webkit-scrollbar': { width: '4px' },
							'&::-webkit-scrollbar-thumb': { background: 'var(--wc-text-disabled)', borderRadius: '2px' },
						}}
					>
						{isLoading && results.length === 0 && (
							<Flex justifyContent="center" py="8">
								<Box w="20px" h="20px" borderRadius="full" border="2px solid var(--wc-text-disabled)" borderTopColor="var(--wc-accent-blue)" animation="spin 0.6s linear infinite" />
							</Flex>
						)}

						{!isLoading && hasSearched && results.length === 0 && (
							<Flex justifyContent="center" py="8">
								<Text fontSize="13px" color="var(--wc-text-muted)">No results</Text>
							</Flex>
						)}

						{!hasSearched && !isLoading && (
							<Flex justifyContent="center" py="8">
								<Text fontSize="13px" color="var(--wc-text-disabled)">Type to search your chats</Text>
							</Flex>
						)}

						{results.map((result, idx) => {
							const isSelected = idx === selectedIndex;
							return (
								<Box
									key={`${result.type}-${result.threadId}-${result.messageId ?? idx}`}
									px="4"
									py="2"
									cursor="pointer"
									borderRadius="md"
									mx="2"
									bg={isSelected ? 'var(--wc-bg-active)' : 'transparent'}
									_hover={{ bg: isSelected ? 'var(--wc-bg-active)' : 'var(--wc-bg-hover)' }}
									onClick={() => handleResultClick(result)}
								>
									{result.type === 'thread' && !result.matchCount && (
										// Thread result (everywhere mode)
										<Flex flexDirection="column" gap="0.5">
											<Flex alignItems="center" gap="1.5">
												<Text fontSize="14px" opacity={0.5}>📝</Text>
												<Text
													fontSize="13px"
													fontWeight="500"
													color="var(--wc-text-primary)"
													overflow="hidden"
													textOverflow="ellipsis"
													whiteSpace="nowrap"
												>
													{highlightText(result.threadTitle, query)}
												</Text>
											</Flex>
											<Text fontSize="11px" color="var(--wc-text-muted)" ml="5">Thread • {timeAgo(result.createdAt)}</Text>
										</Flex>
									)}

									{result.type === 'thread' && result.matchCount !== undefined && (
										// Thread result (threads mode)
										<Flex flexDirection="column" gap="0.5">
											<Flex alignItems="center" gap="1.5">
												<Text fontSize="14px" opacity={0.5}>📝</Text>
												<Text
													fontSize="13px"
													fontWeight="500"
													color="var(--wc-text-primary)"
													overflow="hidden"
													textOverflow="ellipsis"
													whiteSpace="nowrap"
												>
													{highlightText(result.threadTitle, query)}
												</Text>
											</Flex>
											<Text fontSize="11px" color="var(--wc-text-muted)" ml="5">
												{result.matchCount === 0 ? 'Title match' : `${result.matchCount} match${result.matchCount > 1 ? 'es' : ''}`} • {timeAgo(result.createdAt)}
											</Text>
										</Flex>
									)}

									{result.type === 'message' && (
										// Message result
										<Flex flexDirection="column" gap="0.5">
											<Flex alignItems="flex-start" gap="1.5">
												<Text fontSize="14px" opacity={0.5} mt="1">💬</Text>
												<Text
													fontSize="12px"
													color="var(--wc-text-primary)"
													lineClamp={2}
													overflow="hidden"
												>
													{result.snippet ? renderSnippet(result.snippet) : result.threadTitle}
												</Text>
											</Flex>
											<Text fontSize="11px" color="var(--wc-text-muted)" ml="5">
												In: {result.threadTitle} • {result.role} • {timeAgo(result.createdAt)}
											</Text>
										</Flex>
									)}
								</Box>
							);
						})}
					</Box>

					{/* Footer */}
					{results.length > 0 && (
						<Flex
							justifyContent="space-between"
							alignItems="center"
							px="4"
							py="2"
							borderTop="1px solid var(--wc-border-subtle)"
						>
							<Text fontSize="11px" color="var(--wc-text-muted)">{results.length} result{results.length > 1 ? 's' : ''}</Text>
							<Text fontSize="11px" color="var(--wc-text-faint)">↑↓ navigate • ↵ open • esc close</Text>
						</Flex>
					)}
				</Box>
			</Box>
		</Portal>
	);
}
