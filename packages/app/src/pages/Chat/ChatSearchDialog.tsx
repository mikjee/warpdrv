import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, Text, Input, Portal } from '@chakra-ui/react';
import { XIcon, SearchIcon } from 'lucide-react';
import { BsFillFileTextFill } from 'react-icons/bs';
import { useStore } from '@/store';
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

function highlightText(text: string, query: string): React.ReactNode {
	if (!query || !query.trim()) return text;
	const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
	const elements: React.ReactNode[] = [];
	let idx = 0;
	for (const part of parts) {
		if (part.toLowerCase() === query.toLowerCase()) {
			elements.push(<mark key={idx++} style={{ background: 'var(--wc-accent-yellow-hover-bg)', color: 'var(--wc-accent-yellow-strong)', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>);
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
// ChatSearchDialog
// ============================================================

export function ChatSearchDialog({ isOpen, onClose, currentThreadId }: { isOpen: boolean; onClose: () => void; currentThreadId: string | null | undefined }) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<SearchResultEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const setCurrentThreadId = useStore(s => s.setCurrentThreadId);

	// Focus input on open, clear on close
	useEffect(() => {
		if (isOpen) {
			setResults([]);
			setTimeout(() => inputRef.current?.focus(), 50);
		} else {
			setQuery('');
			setResults([]);
		}
	}, [isOpen]);

	// Debounced search
	const handleSearch = useCallback((q: string) => {
		if (timerRef.current) clearTimeout(timerRef.current);
		if (!q.trim() || q.trim().length < 3) {
			setResults([]);
			setIsLoading(false);
			return;
		}
		timerRef.current = setTimeout(async () => {
			setIsLoading(true);
			try {
				const res = await searchChatMessages(q, 'everywhere', { threadId: currentThreadId ?? undefined, limit: 50 });
				if (res.ok && res.data) {
					const deduped = res.data.reduce((acc, item) => {
						const entry = item as unknown as SearchResultEntry;
						if (entry.type === 'message' && acc.some(r => r.messageId === entry.messageId)) {
							return acc;
						}
						acc.push(entry);
						return acc;
					}, [] as SearchResultEntry[]);
					setResults(deduped);
				} else {
					setResults([]);
				}
			} catch {
				setResults([]);
			} finally {
				setIsLoading(false);
			}
		}, 300);
	}, [currentThreadId]);

	// Keyboard: Escape to close
	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [isOpen, onClose]);

	const handleResultClick = (result: SearchResultEntry) => {
		onClose();
		setCurrentThreadId(result.threadId);
		if (result.messageId) {
			setTimeout(() => {
				const el = document.querySelector(`[data-message-id="${result.messageId}"]`) as HTMLElement | null;
				if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 300);
		}
	};

	// Group results by thread
	const groupedResults = useMemo(() => {
		const groups: Map<string, { thread: SearchResultEntry; messages: SearchResultEntry[] }> = new Map();
		const threadOnly: SearchResultEntry[] = [];
		for (const result of results) {
			if (result.type === 'thread') {
				threadOnly.push(result);
				continue;
			}
			if (!groups.has(result.threadId)) {
				groups.set(result.threadId, { thread: result, messages: [] });
			}
			groups.get(result.threadId)!.messages.push(result);
		}
		const sorted = Array.from(groups.values()).sort((a, b) => {
			const aMax = Math.max(...a.messages.map(m => m.createdAt));
			const bMax = Math.max(...b.messages.map(m => m.createdAt));
			return bMax - aMax;
		});
		return { groups: sorted, threadOnly };
	}, [results]);

	const hasQuery = query.trim().length > 0;

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
				>
					<Flex alignItems="center" gap="2" px="4" py="3" borderBottom="1px solid var(--wc-border-subtle)">
						<SearchIcon size={16} style={{ opacity: 0.4, flexShrink: 0 }} />
						<Input
							ref={inputRef}
							variant="subtle"
							placeholder="Search..."
							value={query}
							onChange={(e) => {
								setQuery(e.target.value);
								handleSearch(e.target.value);
							}}
							bg="transparent"
							color="var(--wc-text-primary)"
							fontSize="14px"
							h="32px"
							border="none"
							_focus={{ borderColor: 'transparent', outline: 'none', boxShadow: 'none' }}
						/>
						<Box as="button" cursor="pointer" opacity={0.4} _hover={{ opacity: 0.7 }} onClick={onClose}>
							<XIcon size={16} />
						</Box>
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
								<Text fontSize="13px" color="var(--wc-text-disabled)">Type to search your chats</Text>
							</Flex>
						)}

						{groupedResults.groups.map((group, gIdx) => (
							<Box key={group.thread.threadId} bg="var(--wc-bg-subtle)" borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="md" mx="2" my="1" p="1">
								<Flex alignItems="center" gap="1.5" px="4" py="1.5">
									<BsFillFileTextFill size={14} style={{ opacity: 0.5 }} />
									<Text fontSize="13px" fontWeight="500" color="var(--wc-text-secondary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
										{highlightText(group.thread.threadTitle, query)}
									</Text>
									<Text fontSize="11px" color="var(--wc-text-muted)">{group.messages.length} match{group.messages.length > 1 ? 'es' : ''}</Text>
								</Flex>
								{group.messages.map((result, idx) => (
										<Box
											key={idx}
											px="4"
											py="1.5"
											cursor="pointer"
											borderRadius="md"
											mx="2"
											ml="4"
											_hover={{ bg: 'var(--wc-bg-hover)' }}
											onClick={() => handleResultClick(result)}
										>
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
										</Box>
									))}
							</Box>
						))}

						{groupedResults.threadOnly.map((result, idx) => (
								<Box
									key={idx}
									px="4"
									py="2"
									cursor="pointer"
									borderRadius="md"
									mx="2"
									_hover={{ bg: 'var(--wc-bg-hover)' }}
									onClick={() => handleResultClick(result)}
								>
									<Flex flexDirection="column" gap="0.5">
										<Flex alignItems="center" gap="1.5">
											<BsFillFileTextFill size={14} style={{ opacity: 0.5 }} />
											<Text fontSize="13px" fontWeight="500" color="var(--wc-text-secondary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
												{highlightText(result.threadTitle, query)}
											</Text>
										</Flex>
										<Text fontSize="11px" color="var(--wc-text-muted)" ml="5">Thread • {timeAgo(result.createdAt)}</Text>
									</Flex>
								</Box>
							))}
					</Box>

					{results.length > 0 && (
						<Flex justifyContent="space-between" alignItems="center" px="4" py="2" borderTop="1px solid var(--wc-border-subtle)">
							<Text fontSize="11px" color="var(--wc-text-muted)">{results.length} result{results.length > 1 ? 's' : ''}</Text>
							<Text fontSize="11px" color="var(--wc-text-faint)">esc close</Text>
						</Flex>
					)}
				</Box>
			</Box>
		</Portal>
	);
}
