import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ============================================================
// Types
// ============================================================

interface ChatSearchState {
	isOpen: boolean;
	query: string;
	currentMatch: number;
	totalMatches: number;
	marks: HTMLElement[];
	open: () => void;
	close: () => void;
	setQuery: (q: string) => void;
	goNext: () => void;
	goPrev: () => void;
}

const ChatSearchContext = createContext<ChatSearchState>({
	isOpen: false,
	query: '',
	currentMatch: 0,
	totalMatches: 0,
	marks: [],
	open: () => {},
	close: () => {},
	setQuery: () => {},
	goNext: () => {},
	goPrev: () => {},
});

export function useChatSearch() {
	return useContext(ChatSearchContext);
}

// ============================================================
// DOM search & highlight helpers
// ============================================================

/** Unwrap all marks: move child nodes out of <mark>, remove the tag. Zero text creation/destruction. */
function clearAllMarks(container: HTMLElement) {
	const marks = container.querySelectorAll('.chat-search-highlight');
	marks.forEach((el) => {
		const parent = el.parentNode;
		if (!parent) return;
		while (el.firstChild) {
			parent.insertBefore(el.firstChild, el);
		}
		parent.removeChild(el);
	});
}

/** Walk all text nodes in viewport, wrap matches in <mark>. Returns marks array. */
function highlightAll(viewport: HTMLElement, query: string): HTMLElement[] {
	// Clear existing marks first
	clearAllMarks(viewport);

	if (!query || query.length < 1) return [];

	const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(escaped, 'gi');
	const marks: HTMLElement[] = [];

	// Collect text nodes FIRST — TreeWalker is a live iterator,
	// modifying DOM during iteration corrupts it and skips nodes.
	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(viewport, NodeFilter.SHOW_TEXT, {
		acceptNode(node: Node) {
			const parent = node.parentElement;
			if (!parent) return NodeFilter.FILTER_REJECT;
			const tag = parent.tagName.toLowerCase();
			if (tag === 'script' || tag === 'style' || tag === 'mark') return NodeFilter.FILTER_REJECT;
			if (parent.closest('mark')) return NodeFilter.FILTER_REJECT;
			if (parent.closest('[class*="footer"]') || parent.closest('[class*="action"]') || parent.closest('[class*="composer"]')) return NodeFilter.FILTER_REJECT;
			return NodeFilter.FILTER_ACCEPT;
		},
	});

	while (walker.nextNode()) {
		textNodes.push(walker.currentNode as Text);
	}

	// Now safe to mutate DOM — iterating a static array
	for (const textNode of textNodes) {
		// Skip if node was already replaced (no longer in DOM)
		if (!textNode.parentNode) continue;

		const text = textNode.textContent || '';
		if (!regex.test(text)) continue;

		regex.lastIndex = 0;
		const fragment = document.createDocumentFragment();
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(text)) !== null) {
			if (match.index > lastIndex) {
				fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
			}
const mark = document.createElement('mark');
				mark.className = 'chat-search-highlight';
				mark.appendChild(document.createTextNode(match[0]));
				fragment.appendChild(mark);
				marks.push(mark);
				lastIndex = match.index + match[0].length;
		}

		if (lastIndex < text.length) {
			fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
		}

		textNode.parentNode.replaceChild(fragment, textNode);
	}

	return marks;
}

// ============================================================
// Highlighter — handles viewport attachment and DOM operations
// ============================================================

function ChatSearchHighlighter({ query }: { query: string }) {
	const viewportRef = useRef<HTMLElement | null>(null);
	const observerRef = useRef<MutationObserver | null>(null);
	const marksRef = useRef<HTMLElement[]>([]);

	// Find viewport on mount
	useEffect(() => {
		viewportRef.current = document.querySelector('.aui-thread-viewport') as HTMLElement | null;
	}, []);

	// Apply highlights when query changes
	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;

		const newMarks = highlightAll(viewport, query);
		marksRef.current = newMarks;
	}, [query]);

	// MutationObserver to re-highlight when new messages appear
	useEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		let rafId: number | null = null;

		observerRef.current = new MutationObserver(() => {
			if (rafId) cancelAnimationFrame(rafId);
			rafId = requestAnimationFrame(() => {
				const newMarks = highlightAll(viewport, query);
				marksRef.current = newMarks;
				rafId = null;
			});
		});

		observerRef.current.observe(viewport, {
			childList: true,
			subtree: true,
			attributes: true,
		});

		return () => {
			observerRef.current?.disconnect();
			if (rafId) cancelAnimationFrame(rafId);
		};
	}, [query]);

	return null;
}

// ============================================================
// Provider
// ============================================================

export function ChatSearchProvider({ children }: { children: React.ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [currentMatch, setCurrentMatch] = useState(0);
	const [marks, setMarks] = useState<HTMLElement[]>([]);
	const marksRef = useRef<HTMLElement[]>([]);

	// Debounced query — input is immediate, but highlighting only fires after 200ms
	const [debouncedQuery, setDebouncedQuery] = useState('');
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), 200);
		return () => clearTimeout(timer);
	}, [query]);

	// Sync marks ref with state for scroll-to-active
	useEffect(() => {
		marksRef.current = marks;
	}, [marks]);

	// Sync marks state from highlighter
	useEffect(() => {
		if (marksRef.current.length !== marks.length ||
			!marksRef.current.every((m, i) => m === marks[i])) {
			setMarks(marksRef.current);
		}
	}, [debouncedQuery]);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => {
		setIsOpen(false);
		setQuery('');
		setDebouncedQuery('');
		setCurrentMatch(0);
	}, []);

	const setQueryAndReset = useCallback((q: string) => {
		setQuery(q);
		setCurrentMatch(0);
	}, []);

	const goNext = useCallback(() => {
		setCurrentMatch((prev) => (prev + 1) % marks.length || 0);
	}, [marks.length]);

	const goPrev = useCallback(() => {
		setCurrentMatch((prev) => (prev - 1 + marks.length) % marks.length || 0);
	}, [marks.length]);

	// Scroll to active match
	useEffect(() => {
		// Update marks from ref
		setMarks(marksRef.current);

		if (marks.length === 0 || currentMatch < 0 || currentMatch >= marks.length) return;
		marks.forEach((m, i) => {
			m.classList.toggle('active', i === currentMatch);
		});
		const activeMark = marks[currentMatch];
		if (activeMark) {
			activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, [currentMatch, marks]);

	// Keyboard shortcuts
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			const isCtrl = e.ctrlKey || e.metaKey;

			// Ctrl+F / Cmd+F — open search
			if (isCtrl && e.key === 'f') {
				e.preventDefault();
				setIsOpen((prev) => {
					if (!prev) return true;
					setTimeout(() => {
						const input = document.querySelector('.chat-search-input') as HTMLInputElement;
						input?.focus();
						input?.select();
					}, 10);
					return prev;
				});
				return;
			}

			// Only process other shortcuts when search is open
			if (!isOpen) return;

			// Escape — close
			if (e.key === 'Escape') {
				e.preventDefault();
				close();
				return;
			}

			// F3 — next match (without Shift)
			if (e.key === 'F3' && !e.shiftKey) {
				e.preventDefault();
				goNext();
				return;
			}

			// Shift+F3 — prev match
			if (e.key === 'F3' && e.shiftKey) {
				e.preventDefault();
				goPrev();
				return;
			}

			// Enter — next match
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				goNext();
				return;
			}

			// Shift+Enter — prev match
			if (e.key === 'Enter' && e.shiftKey) {
				e.preventDefault();
				goPrev();
				return;
			}
		};

		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [isOpen, goNext, goPrev, close]);

	const contextValue: ChatSearchState = {
		isOpen,
		query,
		currentMatch,
		totalMatches: marks.length,
		marks,
		open,
		close,
		setQuery: setQueryAndReset,
		goNext,
		goPrev,
	};

	return (
		<ChatSearchContext.Provider value={contextValue}>
			{children}
			<ChatSearchHighlighter query={debouncedQuery} />
			<ChatSearchBar />
		</ChatSearchContext.Provider>
	);
}

// ============================================================
// Search Bar UI — rendered inside thread viewport
// ============================================================

export function ChatSearchBar() {
	const { isOpen, query, currentMatch, totalMatches, setQuery, goNext, goPrev, close } = useChatSearch();

	if (!isOpen) return null;

	return (
		<div
			style={{
				position: 'fixed',
				top: '60px',
				left: '50%',
				transform: 'translateX(-50%)',
				zIndex: 10000,
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				background: 'var(--wc-bg-elevated)',
				border: '1px solid var(--wc-border-default)',
				borderRadius: '10px',
				boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
				padding: '4px 6px 4px 10px',
				width: 'fit-content',
				minWidth: '260px',
				maxWidth: '400px',
				fontSize: '13px',
				animation: 'chat-search-slide-in 0.15s ease-out',
			}}
		>
			<input
				ref={(el) => {
					if (el) el.focus();
				}}
				className="chat-search-input"
				type="text"
				value={query}
				onChange={(e) => setQuery(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (e.shiftKey) goPrev();
						else goNext();
					}
				}}
				placeholder="Search in thread…"
				style={{
					background: 'transparent',
					border: 'none',
					outline: 'none',
					color: 'var(--wc-text-primary)',
					fontSize: '13px',
					padding: '4px 0',
					flex: 1,
					minWidth: 0,
				}}
			/>

			<span
				style={{
					color: totalMatches > 0 ? 'var(--wc-text-secondary)' : 'var(--wc-accent-red)',
					fontSize: '12px',
					whiteSpace: 'nowrap',
					minWidth: '60px',
					textAlign: 'right',
				}}
			>
				{totalMatches > 0 ? `${currentMatch + 1} / ${totalMatches}` : 'No results'}
			</span>

			<button
				type="button"
				onClick={goPrev}
				title="Previous match (Shift+F3)"
				style={{
					background: 'none',
					border: '1px solid var(--wc-border-subtle)',
					borderRadius: '6px',
					color: 'var(--wc-text-secondary)',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '26px',
					height: '26px',
					padding: 0,
					fontSize: '14px',
					transition: 'color 0.15s',
				}}
			>
				&#9650;
			</button>

			<button
				type="button"
				onClick={goNext}
				title="Next match (F3)"
				style={{
					background: 'none',
					border: '1px solid var(--wc-border-subtle)',
					borderRadius: '6px',
					color: 'var(--wc-text-secondary)',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '26px',
					height: '26px',
					padding: 0,
					fontSize: '14px',
					transition: 'color 0.15s',
				}}
			>
				&#9660;
			</button>

			<button
				type="button"
				onClick={close}
				title="Close (Esc)"
				style={{
					background: 'none',
					border: '1px solid var(--wc-border-subtle)',
					borderRadius: '6px',
					color: 'var(--wc-text-secondary)',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '26px',
					height: '26px',
					padding: 0,
					fontSize: '14px',
					transition: 'color 0.15s',
					marginLeft: '2px',
				}}
			>
				&#10005;
			</button>
		</div>
	);
}
