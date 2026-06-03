import React, { useCallback, useMemo, type FC } from 'react';
import { Volume2, Loader2 } from 'lucide-react';
import { FaStop } from 'react-icons/fa';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import { Box } from '@chakra-ui/react';
import removeMd from 'remove-markdown';
import emojiRegex from 'emoji-regex';
import { EventSource } from 'eventsource';

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

let currentAudioEl: HTMLAudioElement | null = null;
let playbackQueue: string[] = [];
let isPlayingChunk = false;
let currentRequestId: number = 0;
let currentEventSource: EventSource | null = null;
let currentStreamAbortId: string | null = null;
let ttsAudioCtx: AudioContext | null = null;
let ttsAnalyser: AnalyserNode | null = null;
let ttsAnalyserListeners: Array<(a: AnalyserNode | null) => void> = [];
function ensureAnalyser(): AnalyserNode {
	if (!ttsAudioCtx) ttsAudioCtx = new AudioContext();
	if (ttsAudioCtx.state === 'suspended') ttsAudioCtx.resume().catch(() => {});
	if (!ttsAnalyser) {
		ttsAnalyser = ttsAudioCtx.createAnalyser();
		ttsAnalyser.fftSize = 256;
		ttsAnalyser.smoothingTimeConstant = 0.8;
		ttsAnalyser.connect(ttsAudioCtx.destination);
		for (const l of ttsAnalyserListeners) l(ttsAnalyser);
	}
	return ttsAnalyser;
}
export function getTTSAnalyser(): AnalyserNode | null {
	return ttsAnalyser;
}
export function subscribeTTSAnalyser(cb: (a: AnalyserNode | null) => void): () => void {
	ttsAnalyserListeners.push(cb);
	cb(ttsAnalyser);
	return () => {
		ttsAnalyserListeners = ttsAnalyserListeners.filter(l => l !== cb);
	};
}
function checkVadComplete() {
	const s = useStore.getState();
	const queueLen = playbackQueue.length;
	const playing = isPlayingChunk;
	const generating = s.ttsIsGenerating;
	const sent = s.ttsVadSentencesSent;
	const done = s.ttsVadSentencesDone;
	const threadId = s.activeThreadId;
	const running = threadId ? s.isRunningByThread[threadId] : false;
	console.log('[TTS vad] checkVadComplete: queue=', queueLen, 'playing=', playing, 'generating=', generating, 'sent=', sent, 'done=', done, 'running=', running);
	if (queueLen > 0 || playing) return;
	if (generating !== 'vad') return;
	if (sent !== done) return;
	if (threadId && running) return;
	console.log('[TTS vad] checkVadComplete: all done, calling stopTTS');
	stopTTS();
}

export async function startStream(requestId: number, text: string, voice: string): Promise<void> {
	const cleaned = removeMd(text).replace(emojiRegex(), '').replace(/\s+/g, ' ').trim();
	if (!cleaned) { console.log('[TTS] startStream: cleaned text is empty'); return; }
	console.log('[TTS] startStream: requestId=', requestId, 'text=', JSON.stringify(cleaned.slice(0, 60)));
	const startRes = await fetch('/api/kokoro/tts/start', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text: cleaned, voice }),
	});
	const startJson = await startRes.json();
	if (!startJson.ok) throw new Error(startJson.error || 'tts start failed');
	const streamId = startJson.data.streamId as string;
	if (requestId !== currentRequestId) {
		console.log('[TTS] startStream: requestId mismatch after fetch, requestId=', requestId, 'currentRequestId=', currentRequestId, 'aborting');
		fetch(`/api/kokoro/tts/abort/${streamId}`, { method: 'POST' }).catch(() => {});
		return;
	}
	console.log('[TTS] startStream: streamId=', streamId, 'setting up SSE');
	currentStreamAbortId = streamId;
	const es = new EventSource(`/api/kokoro/tts/stream/${streamId}`);
	currentEventSource = es;
	es.addEventListener('chunk', (e: MessageEvent) => {
		if (requestId !== currentRequestId) {
			console.log('[TTS] chunk DROPPED: requestId', requestId, '!== currentRequestId', currentRequestId);
			return;
		}
		const activeMsg = useStore.getState().ttsActiveMessageId;
		if (activeMsg === null) {
			console.log('[TTS] chunk DROPPED: ttsActiveMessageId is null');
			return;
		}
		const payload = JSON.parse(e.data);
		const bin = atob(payload.audio);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
		playbackQueue.push(url);
		tryPlayNext();
	});
	es.addEventListener('done', () => {
		console.log('[TTS] stream done: requestId=', requestId, 'currentRequestId=', currentRequestId, 'generating=', useStore.getState().ttsIsGenerating);
		es.close();
		if (currentEventSource === es) currentEventSource = null;
		currentStreamAbortId = null;
		if (requestId !== currentRequestId) return;
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
	});
	es.addEventListener('error', (e: MessageEvent) => {
		es.close();
		if (currentEventSource === es) currentEventSource = null;
		currentStreamAbortId = null;
		console.error('[KokoroTTS] Stream error:', (e as any)?.data);
		useStore.getState().ttsStop();
	});
}

function tryPlayNext() {
	console.log('[TTS] tryPlayNext: queue=', playbackQueue.length, 'playing=', isPlayingChunk);
	if (isPlayingChunk || playbackQueue.length === 0) return;
	const url = playbackQueue.shift();
	if (!url) return;
	isPlayingChunk = true;
	const audioEl = new Audio(url);
	currentAudioEl = audioEl;
	try {
		const analyser = ensureAnalyser();
		const src = ttsAudioCtx!.createMediaElementSource(audioEl);
		src.connect(analyser);
	} catch (e) {
		console.error('[KokoroTTS] analyser wire failed:', e);
	}
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
	console.log('[TTS] stopTTS: requestId→0, clearing queue, closing EventSource, aborting stream');
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
	const s = useStore.getState();
	const activeId = s.ttsActiveMessageId;
	if (activeId) s.ttsClearSpokenIndex(activeId);
	s.ttsVadReset();
	s.ttsStop();
	if (currentEventSource) {
		currentEventSource.close();
		currentEventSource = null;
	}
	if (currentStreamAbortId) {
		fetch(`/api/kokoro/tts/abort/${currentStreamAbortId}`, { method: 'POST' }).catch(() => {});
		currentStreamAbortId = null;
	}
}

export function setKokoroCurrentRequestId(id: number) {
	currentRequestId = id;
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
			await startStream(requestId, messageText, voice);
		} catch (err) {
			console.error('[KokoroTTS] Stream failed:', err);
			useStore.getState().ttsStop();
		}
	}, [isActive, activeMessageId, messageId, messageText, voice, ttsStart]);

	return (
		<ActionBarIcon onClick={handleSpeak}>
			{isActive ? (isSpeaking ? <FaStop style={{ fontSize: 14, color: 'var(--wc-accent-green)', animation: 'pulse 1.5s ease infinite' }} /> : <Loader2 size={14} className="animate-spin" />) : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});
