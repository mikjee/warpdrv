import React, { useCallback, useMemo, type FC } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { FaStop } from 'react-icons/fa';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import { Box } from '@chakra-ui/react';

const ActionBarIcon: FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
	<Box
		w="28px"
		h="28px"
		display="flex"
		alignItems="center"
		justifyContent="center"
		cursor="pointer"
		rounded="md"
		color="var(--wc-text-secondary)"
		_hover={{ bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' }}
		onClick={onClick}
	>
		{children}
	</Box>
);

// --- Worker management ---

let ttsWorker: Worker | null = null;
let workerReady = false;
let workerReadyPromise: Promise<void> | null = null;
let currentAudioEl: HTMLAudioElement | null = null;
let playbackQueue: string[] = [];
let isPlayingChunk = false;
let currentRequestId: number = 0;
function checkVadComplete() {
	if (playbackQueue.length > 0 || isPlayingChunk) return;
	const s = useStore.getState();
	if (s.ttsIsGenerating !== 'vad') return;
	if (s.ttsVadSentencesSent !== s.ttsVadSentencesDone) return;
	const threadId = s.activeThreadId;
	if (threadId && s.isRunningByThread[threadId]) return;
	stopTTS();
}

export function getWorker() {
	if (!ttsWorker) {
		ttsWorker = new Worker(
			new URL('./KokoroTTS.worker.ts', import.meta.url),
			{ type: 'module' }
		);
		const baseUrl = window.location.origin;
		const modelUrl = `${baseUrl}/api/kokoro/kokoro-model`;
		ttsWorker.postMessage({ type: 'init', baseUrl, modelUrl });
		workerReadyPromise = new Promise((resolve, reject) => {
			ttsWorker!.onmessage = (e) => {
				const msg = e.data;
				if (msg.type === 'ready') {
					workerReady = true;
					resolve();
					return;
				}
				if (msg.requestId !== undefined && msg.requestId !== currentRequestId) {
					return;
				}
				if (msg.type === 'chunk') {
					if (useStore.getState().ttsActiveMessageId === null) return;
					const url = URL.createObjectURL(new Blob([msg.audio], { type: 'audio/wav' }));
					playbackQueue.push(url);
					tryPlayNext();
				}  else if (msg.type === 'done') {
					const s = useStore.getState();
					if (s.ttsIsGenerating === 'button') {
						s.ttsSetGenerating(null);
						if (playbackQueue.length === 0 && !isPlayingChunk) {
							s.ttsSetSpeaking(false);
						}
					} else if (s.ttsIsGenerating === 'vad') {
						s.ttsVadIncDone();
						checkVadComplete();
					}
				} else if (msg.type === 'error') {
					console.error('[KokoroTTS] Worker error:', msg.message);
					useStore.getState().ttsStop();
					reject(new Error(msg.message));
				}
			};
		});
	}
	return ttsWorker;
}

function tryPlayNext() {
	if (isPlayingChunk || playbackQueue.length === 0) return;
	const url = playbackQueue.shift();
	if (!url) return;
	isPlayingChunk = true;
	const audioEl = new Audio(url);
	currentAudioEl = audioEl;
	if (!useStore.getState().ttsIsSpeaking) {
		useStore.getState().ttsSetSpeaking(true);
	}
	audioEl.onended = () => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
		tryPlayNext();
		if (playbackQueue.length === 0 && !isPlayingChunk && !useStore.getState().ttsIsGenerating) {
			useStore.getState().ttsSetSpeaking(false);
		}
		checkVadComplete();
	};
	audioEl.onerror = () => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
		tryPlayNext();
		if (playbackQueue.length === 0 && !isPlayingChunk && !useStore.getState().ttsIsGenerating) {
			useStore.getState().ttsSetSpeaking(false);
		}
		checkVadComplete();
	};
	audioEl.play().catch(() => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
	});
}

export function stopTTS() {
	currentRequestId = 0;
	if (currentAudioEl) {
		currentAudioEl.pause();
		currentAudioEl.currentTime = 0;
		currentAudioEl = null;
	}
	for (const url of playbackQueue) {
		URL.revokeObjectURL(url);
	}
	playbackQueue = [];
	isPlayingChunk = false;
	useStore.getState().ttsVadReset();
	useStore.getState().ttsStop();
	if (ttsWorker) {
		ttsWorker.postMessage({ type: 'stop' });
	}
}

export function initTTSWorker() {
	getWorker();
}

export const KokoroTTSButton = React.memo(() => {
	const parts = useAuiState((s) => s.message.content);
	const messageId = useAuiState((s) => s.message.id);
	const voice = useStore((s) => s.settings.kokoroVoice || 'af_heart');

	const activeMessageId = useStore((s) => s.ttsActiveMessageId);
	const isGenerating = useStore((s) => s.ttsIsGenerating);
	const isSpeaking = useStore((s) => s.ttsIsSpeaking);
	const ttsStart = useStore((s) => s.ttsStart);

	const isActive = activeMessageId === messageId;

	const messageText = useMemo(() => {
		if (!parts || parts.length === 0) return '';
		return parts
			.filter((p: any) => p.type === 'text')
			.map((p: any) => p.text)
			.join('\n\n');
	}, [parts]);

	const handleSpeak = useCallback(async () => {
		if (isActive) {
			stopTTS();
			return;
		}
		if (activeMessageId) {
			stopTTS();
		}
		if (!messageText.trim()) return;
		playbackQueue = [];
		const requestId = Date.now();
		currentRequestId = requestId;
		ttsStart(messageId);
		try {
			await workerReadyPromise;
			const worker = getWorker();
			worker.postMessage({ type: 'stream', requestId, text: messageText, voice });
		} catch (err) {
			console.error('[KokoroTTS] Worker init failed:', err);
			useStore.getState().ttsStop();
		}
	}, [isActive, activeMessageId, messageId, messageText, voice, ttsStart]);

	return (
		<ActionBarIcon onClick={handleSpeak}>
			{isActive ? (isSpeaking ? <FaStop style={{ fontSize: 14, color: 'var(--wc-accent-green)', animation: 'pulse 1.5s ease infinite' }} /> : <Loader2 size={14} className="animate-spin" />) : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});
