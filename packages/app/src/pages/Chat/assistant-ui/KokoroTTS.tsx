import React, { useCallback, useState, useMemo, type FC } from 'react';
import { Volume2, SquareIcon, Loader2 } from 'lucide-react';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import { Box } from '@chakra-ui/react';

const ActionBarIcon: FC<{ children: React.ReactNode; onClick?: () => void; disabled?: boolean }> = ({ children, onClick, disabled }) => (
	<Box
		w="28px"
		h="28px"
		display="flex"
		alignItems="center"
		justifyContent="center"
		cursor={disabled ? 'not-allowed' : 'pointer'}
		rounded="md"
		color="var(--wc-text-secondary)"
		_hover={!disabled ? { bg: 'var(--wc-bg-selected)', color: 'var(--wc-text-heading)' } : undefined}
		onClick={disabled ? undefined : onClick}
		opacity={disabled ? 0.5 : 1}
	>
		{children}
	</Box>
);

let kokoroInstance: any = null;
let kokoroLoading = false;
let kokoroLoadPromise: Promise<any> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let aborting = false;

function stopPlayback() {
	if (currentAudio) {
		currentAudio.pause();
		currentAudio.currentTime = 0;
		currentAudio = null;
	}
	if (currentUrl) {
		URL.revokeObjectURL(currentUrl);
		currentUrl = null;
	}
	aborting = true;
}

export async function getKokoroTTS() {
	if (kokoroInstance) return kokoroInstance;
	if (kokoroLoadPromise) return kokoroLoadPromise;
	kokoroLoading = true;
	kokoroLoadPromise = (async () => {
		try {
			const { KokoroTTS, setVoiceDataUrl, env: kokoroEnv } = await import('kokoro-js');
			const { env } = await import('@huggingface/transformers');
			const baseUrl = window.location.origin;
			const modelUrl = `${baseUrl}/api/kokoro/kokoro-model`;
			kokoroEnv.wasmPaths = '/onnxruntime/';
			env.remoteHost = baseUrl;
			env.remotePathTemplate = '/api/kokoro/kokoro-model';
			env.allowLocalModels = false;
			setVoiceDataUrl(`${modelUrl}/voices`);
			console.log('[KokoroTTS] Loading model...');
			kokoroInstance = await KokoroTTS.from_pretrained('kokoro', {
				dtype: 'fp32',
				device: 'wasm',
			});
			console.log('[KokoroTTS] Model loaded');
			kokoroLoading = false;
			return kokoroInstance;
		} catch (err) {
			console.error('[KokoroTTS] Failed to initialize:', err);
			kokoroLoading = false;
			return null;
		}
	})();
	return kokoroLoadPromise;
}

export const KokoroTTSButton = React.memo(() => {
	const [speaking, setSpeaking] = useState(false);
	const [loading, setLoading] = useState(false);
	const parts = useAuiState((s) => s.message.content);
	const voice = useStore((s) => s.settings.kokoroVoice || 'af_heart');

	const messageText = useMemo(() => {
		if (!parts || parts.length === 0) return '';
		return parts
			.filter((p: any) => p.type === 'text')
			.map((p: any) => p.text)
			.join('\n\n');
	}, [parts]);

	const handleSpeak = useCallback(async () => {
		if (speaking) {
			stopPlayback();
			setSpeaking(false);
			return;
		}
		if (!messageText.trim()) return;
		setLoading(true);
		setSpeaking(true);
		aborting = false;
		const timeout = setTimeout(() => {
			console.error('[KokoroTTS] Timed out');
			stopPlayback();
			setSpeaking(false);
			setLoading(false);
		}, 20000);
		try {
			const tts = await getKokoroTTS();
			if (tts) {
				console.log('[KokoroTTS] Generating audio...');
				const audio = await tts.generate(messageText, { voice });
				if (aborting) {
					console.log('[KokoroTTS] Generation cancelled');
					setSpeaking(false);
					setLoading(false);
					return;
				}
				console.log('[KokoroTTS] Audio generated, playing...');
				try {
					const buffer = audio.toWav();
					const blob = new Blob([buffer], { type: 'audio/wav' });
					const url = URL.createObjectURL(blob);
					currentUrl = url;
					const audioEl = new Audio(url);

					audioEl.onplay = () => {
						currentAudio = audioEl;
					};
					audioEl.onended = () => {
						if (currentAudio === audioEl) {
							currentAudio = null;
							currentUrl = null;
						}
						URL.revokeObjectURL(url);
						clearTimeout(timeout);
						setSpeaking(false);
						setLoading(false);
					};
					audioEl.onerror = (e) => {
						console.error('[KokoroTTS] Audio element error:', e);
						if (currentAudio === audioEl) {
							currentAudio = null;
							currentUrl = null;
						}
						URL.revokeObjectURL(url);
						clearTimeout(timeout);
						setSpeaking(false);
						setLoading(false);
					};
					await audioEl.play();
				} catch (playErr) {
					console.error('[KokoroTTS] Playback failed:', playErr);
					setSpeaking(false);
					setLoading(false);
				}
			} else {
				setSpeaking(false);
				setLoading(false);
			}
		} catch (err) {
			console.error('[KokoroTTS] Failed to speak:', err);
			setSpeaking(false);
			setLoading(false);
		} finally {
			clearTimeout(timeout);
		}
	}, [speaking, messageText, voice]);

	return (
		<ActionBarIcon onClick={handleSpeak} disabled={loading}>
			{loading ? <Loader2 size={14} className="animate-spin" /> : speaking ? <SquareIcon size={14} /> : <Volume2 size={14} />}
		</ActionBarIcon>
	);
});
