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

async function getKokoroTTS() {
	if (kokoroInstance) return kokoroInstance;
	if (kokoroLoading) return null;
	kokoroLoading = true;
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
			window.speechSynthesis.cancel();
			setSpeaking(false);
			return;
		}
		if (!messageText.trim()) return;
		setLoading(true);
		setSpeaking(true);
		const timeout = setTimeout(() => {
			console.error('[KokoroTTS] Timed out');
			setSpeaking(false);
			setLoading(false);
		}, 60000);
		try {
			const tts = await getKokoroTTS();
			if (tts) {
				console.log('[KokoroTTS] Generating audio...');
				const audio = await tts.generate(messageText, { voice });
				console.log('[KokoroTTS] Audio generated, playing...');
				const url = URL.createObjectURL(audio.toBlob());
				const audioEl = new Audio(url);
				audioEl.onended = () => {
					clearTimeout(timeout);
					setSpeaking(false);
					setLoading(false);
					URL.revokeObjectURL(url);
				};
				audioEl.onerror = () => {
					clearTimeout(timeout);
					setSpeaking(false);
					setLoading(false);
					URL.revokeObjectURL(url);
				};
				await audioEl.play();
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
