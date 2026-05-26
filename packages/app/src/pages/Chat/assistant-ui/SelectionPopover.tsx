import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Volume2 } from 'lucide-react';
import { FaStop } from 'react-icons/fa';
import { Box } from '@chakra-ui/react';
import TextareaAutosize from 'react-textarea-autosize';
import { useStore } from '@/store';
import { setKokoroCurrentRequestId, startStream, stopTTS } from './KokoroTTS';

export const SelectionPopover = () => {
	const ref = useRef<HTMLDivElement>(null);
	const visibleRef = useRef(false);
	const dirtyRef = useRef(false);
	const isMyTTSRef = useRef(false);
	const selectedTextRef = useRef('');
	const [selectedText, setSelectedText] = useState('');
	const [inputText, setInputText] = useState('');
	const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
	const [visible, setVisible] = useState(false);

	const voice = useStore(s => s.settings.kokoroVoice || 'af_heart');
	const isMyTTS = useStore(s => s.ttsActiveMessageId === 'selection');
	const isSpeaking = useStore(s => s.ttsIsSpeaking);
	const isGenerating = useStore(s => s.ttsIsGenerating);
	const addAnnotation = useStore(s => s.addAnnotation);

	useEffect(() => { visibleRef.current = visible; }, [visible]);
	useEffect(() => { isMyTTSRef.current = isMyTTS; }, [isMyTTS]);
	useEffect(() => { dirtyRef.current = inputText !== '' || isMyTTS; }, [inputText, isMyTTS]);
	useEffect(() => { selectedTextRef.current = selectedText; }, [selectedText]);

	useEffect(() => {
		const handleMouseUp = (e: MouseEvent) => {
			if (visibleRef.current && ref.current && ref.current.contains(e.target as Node)) return;
			const selection = window.getSelection();
			if (!selection || selection.isCollapsed || !selection.rangeCount) {
				setVisible(false);
				return;
			}
			const text = selection.toString().trim();
			if (!text) { setVisible(false); return; }
			if (visibleRef.current && text === selectedTextRef.current) return;

			let element: Node | null = selection.anchorNode;
			while (element) {
				if (element.nodeType === Node.ELEMENT_NODE) {
					const role = (element as HTMLElement).getAttribute('data-role');
					if (role === 'user' || role === 'assistant') {
						const rect = selection.getRangeAt(0).getBoundingClientRect();
						if (rect.height > 0) {
							stopTTS();
							setSelectedText(text);
							setInputText('');
							setPosition({ left: rect.left, top: rect.bottom + 6 });
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
			if (!visibleRef.current || !ref.current) return;
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
				if (isMyTTSRef.current) stopTTS();
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
	}, []);

	const handleDone = useCallback(() => {
		if (!inputText.trim()) { setVisible(false); return; }
		addAnnotation(selectedText, inputText);
		setInputText('');
		setVisible(false);
	}, [inputText, selectedText, addAnnotation]);

	const handleTTS = useCallback(async () => {
		if (isMyTTS) { stopTTS(); return; }
		stopTTS();
		useStore.getState().ttsStart('selection');
		const requestId = Date.now();
		setKokoroCurrentRequestId(requestId);
		try { await startStream(requestId, selectedText, voice); }
		catch (err) { console.error('[SelectionPopover] TTS failed:', err); useStore.getState().ttsStop(); }
	}, [isMyTTS, selectedText, voice]);

	if (!visible || !position) return null;

	return (
		<div
			ref={ref}
			onMouseDown={(e) => {
				if (e.target instanceof HTMLTextAreaElement) return;
				e.preventDefault();
			}}
			style={{
				position: 'fixed',
				width: '300px',
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
			<Box
				as="button"
				w="28px" h="28px" display="flex" alignItems="center" justifyContent="center"
				border="none" bg="transparent" borderRadius="6px" cursor="pointer"
				color="var(--wc-text-secondary)" flexShrink={0}
				_hover={{ bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' }}
				onClick={handleTTS}
				title={isMyTTS ? 'Stop' : 'Read aloud'}
			>
				{isMyTTS
					? (isSpeaking
						? <FaStop style={{ fontSize: 14, color: 'var(--wc-accent-green)', animation: 'pulse 1.5s ease infinite' }} />
						: isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Volume2 size={14} />)
					: <Volume2 size={14} />}
			</Box>
			<TextareaAutosize
				value={inputText}
				onChange={(e) => setInputText(e.target.value)}
				onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleDone(); } }}
				placeholder="Annotate…"
				minRows={1}
				maxRows={4}
				style={{
					flex: 1, minWidth: '150px',
					background: 'var(--wc-bg-subtle)', border: '1px solid var(--wc-border-subtle)',
					borderRadius: '6px', padding: '5px 8px', fontSize: '12px',
					color: 'var(--wc-text-primary)', outline: 'none', resize: 'none',
					fontFamily: 'inherit', lineHeight: '1.4',
				}}
			/>
			{inputText && (
				<Box
					as="button"
					w="28px" h="28px" display="flex" alignItems="center" justifyContent="center"
					border="none" bg="transparent" borderRadius="6px" cursor="pointer"
					color="var(--wc-text-secondary)" flexShrink={0}
					_hover={{ bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' }}
					onClick={handleDone}
					title="Done"
				>
					<Check size={14} />
				</Box>
			)}
		</div>
	);
};
