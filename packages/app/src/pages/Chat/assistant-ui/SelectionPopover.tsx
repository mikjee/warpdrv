import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Volume2 } from 'lucide-react';
import { FaStop } from 'react-icons/fa';
import { useStore } from '@/store';
import { setKokoroCurrentRequestId, startStream, stopTTS } from './KokoroTTS';

export function SelectionPopover() {
	const ref = useRef<HTMLDivElement>(null);
	const dirtyRef = useRef(false);
	const [selectedText, setSelectedText] = useState('');
	const [inputText, setInputText] = useState('');
	const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
	const [visible, setVisible] = useState(false);

	const voice = useStore(s => s.settings.kokoroVoice || 'af_heart');
	const isMyTTS = useStore(s => s.ttsActiveMessageId === 'selection');
	const isSpeaking = useStore(s => s.ttsIsSpeaking);
	const isGenerating = useStore(s => s.ttsIsGenerating);

	useEffect(() => {
		const isDirty = inputText !== '' || isMyTTS;
		dirtyRef.current = isDirty;
	}, [inputText, isMyTTS]);

	useEffect(() => {
		const handleMouseUp = (e: MouseEvent) => {
			if (visible) return;
			if (ref.current && ref.current.contains(e.target as Node)) return;
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed || !selection.rangeCount) {
				setVisible(false);
				return;
			}

			const text = selection.toString().trim();
			if (!text) {
				setVisible(false);
				return;
			}

			const anchorNode = selection.anchorNode;
			let element: Node | null = anchorNode;
			while (element) {
				if (element.nodeType === Node.ELEMENT_NODE) {
					const role = (element as HTMLElement).getAttribute('data-role');
					if (role === 'user' || role === 'assistant') {
						const rect = selection.getRangeAt(0).getBoundingClientRect();
						if (rect.height > 0) {
							stopTTS();
							setSelectedText(text);
							setInputText('');
							setPosition({
								left: rect.left,
								top: rect.bottom + 6,
							});
							setVisible(true);
						}
						return;
					}
				}
				element = element.parentNode;
			}
			setVisible(false);
		};

		const handleMouseDown = (e: MouseEvent) => {
			if (!visible || !ref.current) return;
			if (ref.current.contains(e.target as Node)) return;
			if (dirtyRef.current) return;
			setVisible(false);
		};

		const handleScroll = () => {
			if (dirtyRef.current) return;
			setVisible(false);
		};

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				if (isMyTTS) stopTTS();
				setVisible(false);
			}
		};

		document.addEventListener('mouseup', handleMouseUp);
		document.addEventListener('mousedown', handleMouseDown);
		window.addEventListener('scroll', handleScroll, true);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('mousedown', handleMouseDown);
			window.removeEventListener('scroll', handleScroll, true);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [visible, isMyTTS]);

	const handleDone = () => {
		console.log('[SelectionPopover] annotation', { selectedText, comment: inputText });
		setVisible(false);
	};

	const handleTTS = async () => {
		if (isMyTTS) {
			stopTTS();
			return;
		}
		stopTTS();
		const store = useStore.getState();
		store.ttsStart('selection');
		const requestId = Date.now();
		setKokoroCurrentRequestId(requestId);
		try {
			await startStream(requestId, selectedText, voice);
		} catch (err) {
			console.error('[SelectionPopover] TTS failed:', err);
			useStore.getState().ttsStop();
		}
	};

	if (!visible || !position) return null;

	const btnStyle = {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		width: '28px',
		height: '28px',
		border: 'none',
		background: 'transparent',
		borderRadius: '6px',
		cursor: 'pointer',
		color: 'var(--wc-text-secondary)',
		flexShrink: 0,
	};

	const hoverIn = (e: MouseEvent) => {
		(e.target as HTMLElement).style.background = 'var(--wc-bg-selected)';
		(e.target as HTMLElement).style.color = 'var(--wc-text-heading)';
	};
	const hoverOut = (e: MouseEvent) => {
		(e.target as HTMLElement).style.background = 'transparent';
		(e.target as HTMLElement).style.color = 'var(--wc-text-secondary)';
	};

	return (
		<div
			ref={ref}
			style={{
				position: 'fixed',
				left: `${position.left}px`,
				top: `${position.top}px`,
				zIndex: 9999,
				background: 'var(--wc-bg-elevated)',
				border: '1px solid var(--wc-border-overlay)',
				borderRadius: '10px',
				boxShadow: '0 8px 32px var(--wc-overlay-modal)',
				padding: '6px 8px',
				display: 'flex',
				alignItems: 'center',
				gap: '6px',
				userSelect: 'none',
			}}
		>
			<button
				style={btnStyle}
				onClick={handleTTS}
				title={isMyTTS ? 'Stop' : 'Read aloud'}
				onMouseEnter={hoverIn}
				onMouseLeave={hoverOut}
			>
				{isMyTTS
					? (isSpeaking
						? <FaStop style={{ fontSize: 14, color: 'var(--wc-accent-green)', animation: 'pulse 1.5s ease infinite' }} />
						: <Loader2 size={14} className="animate-spin" />)
					: <Volume2 size={14} />}
			</button>
			<textarea
				value={inputText}
				onChange={(e) => setInputText(e.target.value)}
				placeholder="Annotate…"
				rows={1}
				style={{
					flex: 1,
					minWidth: '100px',
					maxWidth: '400px',
					minHeight: '28px',
					background: 'var(--wc-bg-subtle)',
					border: '1px solid var(--wc-border-subtle)',
					borderRadius: '6px',
					padding: '5px 8px',
					fontSize: '12px',
					color: 'var(--wc-text-primary)',
					outline: 'none',
					resize: 'both',
					fontFamily: 'inherit',
					lineHeight: '1.4',
					overflowY: 'auto',
					fieldSizing: 'content',
				}}
			/>
			{inputText && (
				<button
					style={btnStyle}
					onClick={handleDone}
					title="Done"
					onMouseEnter={hoverIn}
					onMouseLeave={hoverOut}
				>
					<Check size={14} />
				</button>
			)}
		</div>
	);
}
