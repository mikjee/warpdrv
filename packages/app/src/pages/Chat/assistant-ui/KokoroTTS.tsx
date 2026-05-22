import React, { useCallback, useMemo, type FC } from 'react';
import { Volume2, SquareIcon, Loader2 } from 'lucide-react';
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
let isStopped = false;

function getWorker() {
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
				} else if (msg.type === 'chunk') {
					if (isStopped) {
						return;
					}
					const url = URL.createObjectURL(new Blob([msg.audio], { type: 'audio/wav' }));
					playbackQueue.push(url);
					tryPlayNext();
				} else if (msg.type === 'done') {
					useStore.getState().ttsSetGenerating(false);
				} else if (msg.type === 'error') {
					console.error('[KokoroTTS] Worker error:', msg.message);
					useStore.getState().ttsSetGenerating(false);
					reject(new Error(msg.message));
				}
			};
		});
	}
	return ttsWorker;
}

function tryPlayNext() {
	if (isPlayingChunk || playbackQueue.length === 0 || isStopped) return;
	const url = playbackQueue.shift();
	if (!url) return;
	isPlayingChunk = true;
	const audioEl = new Audio(url);
	currentAudioEl = audioEl;
	useStore.getState().ttsSetSpeaking(true);
	audioEl.onended = () => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
		const { ttsActiveMessageId, ttsIsGenerating } = useStore.getState();
		if (!ttsActiveMessageId || !ttsIsGenerating) {
			useStore.getState().ttsSetSpeaking(false);
		}
		tryPlayNext();
	};
	audioEl.onerror = () => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
		const { ttsActiveMessageId, ttsIsGenerating } = useStore.getState();
		if (!ttsActiveMessageId || !ttsIsGenerating) {
			useStore.getState().ttsSetSpeaking(false);
		}
		tryPlayNext();
	};
	audioEl.play().catch(() => {
		if (currentAudioEl === audioEl) {
			currentAudioEl = null;
		}
		URL.revokeObjectURL(url);
		isPlayingChunk = false;
		const { ttsActiveMessageId, ttsIsGenerating } = useStore.getState();
		if (!ttsActiveMessageId || !ttsIsGenerating) {
			useStore.getState().ttsSetSpeaking(false);
		}
	});
}

function stopPlayback() {
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
	isStopped = true;
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
			stopPlayback();
			return;
		}
		if (activeMessageId) {
			stopPlayback();
		}
		if (!messageText.trim()) return;
		isStopped = false;
		playbackQueue = [];
		ttsStart(messageId);
		try {
			await workerReadyPromise;
			const worker = getWorker();
			worker.postMessage({ type: 'stream', text: messageText, voice });
		} catch (err) {
			console.error('[KokoroTTS] Worker init failed:', err);
			useStore.getState().ttsStop();
		}
	}, [isActive, activeMessageId, messageId, messageText, voice, ttsStart]);

	return (
		<ActionBarIcon onClick={handleSpeak}>
			{isActive ? (isSpeaking ? <SquareIcon size={14} /> : <Loader2 size={14} className="animate-spin" />) : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});
