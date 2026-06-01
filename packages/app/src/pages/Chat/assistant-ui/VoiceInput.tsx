import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, HStack } from '@chakra-ui/react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { RiVoiceprintLine } from 'react-icons/ri';
import { useStore } from '@/store';
import { EWhisperServerStatus } from '@warpcore/shared';
import { createVADSession, float32ToWavBlob } from './VADManager';
import { stopTTS } from './KokoroTTS';
// COMMENTED OUT: per-thread whisper server selection no longer used
// import { parseWhisperThreadMeta } from './WhisperServerSelector';
import { useDictation } from './DictationContext';
import type { AssistantClient } from '@assistant-ui/react';

interface IVoiceInputProps {
	threadId: string | null;
	onTranscript: (text: string) => void;
	aui: AssistantClient;
	onStreamChange?: (stream: MediaStream | null) => void;
}

// Shared: pure transcription, no state side effects
async function transcribeAudioRaw(serverId: string, _server: any, audioBlob: Blob): Promise<string | null> {
	const formData = new FormData();
	formData.append('file', audioBlob, 'audio.webm');

	const response = await fetch(`/api/whisper-servers/${serverId}/transcribe`, {
		method: 'POST',
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Transcription failed: ${response.status}`);
	}

	const result = await response.json();
	return result.text?.trim() ?? null;
}

export const VoiceInput = React.memo(({ threadId, onTranscript, aui, onStreamChange }: IVoiceInputProps) => {
	const { setWaveformStream, isActive: dictationActive, source: dictationSource, isTranscribing: dictationTranscribing, start: startDictation, stop: stopDictation, setIsActive, setSource, sendTextToPopover } = useDictation();
	// PTT state (independent)
	const [isPTTRecording, setIsPTTRecording] = useState(false);
	const [isPTTTranscribing, setIsPTTTranscribing] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const pttWaveformStreamRef = useRef<MediaStream | null>(null);

	// VAD state (independent)
	const vadActive = useStore(s => s.vadActive);
	const setVadActive = useStore(s => s.setVadActive);
	const [isVADTranscribing, setIsVADTranscribing] = useState(false);
	const vadSessionRef = useRef<ReturnType<typeof createVADSession> | null>(null);
	const vadWaveformStreamRef = useRef<MediaStream | null>(null);

	const whisperServers = useStore(s => s.whisperServers);
	const selectedWhisperServerId = useStore(s => s.selectedWhisperServerId);
	const micDeviceId = useStore(s => s.settings.micDeviceId);

	// COMMENTED OUT: per-thread whisper server selection no longer used
	// const tempWhisperServerId = useStore(s => s.tempThreadWhisperServerId);
	// const thread = useStore(s => threadId ? s.threads[threadId] : null);
	// const assignedWhisperServerId = useMemo(
	// 	() => thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
	// 	[thread]
	// );
	// const activeWhisperServerId = useMemo(
	// 	() => assignedWhisperServerId ?? tempWhisperServerId,
	// 	[assignedWhisperServerId, tempWhisperServerId]
	// );

	const activeWhisperServerId = selectedWhisperServerId;
	const activeWhisperServer = useMemo(
		() => activeWhisperServerId ? whisperServers[activeWhisperServerId] : null,
		[activeWhisperServerId, whisperServers]
	);
	const isWhisperReady = activeWhisperServer?.status === EWhisperServerStatus.RUNNING;

	const handleDictationToggle = useCallback(() => {
		if (dictationActive) {
			console.log('[Dictation] toggle clicked: stopping dictation');
			stopDictation();
		} else {
			console.log('[Dictation] toggle clicked: starting dictation, isActive→true, source=composer');
			setIsActive(true);
			setSource('composer');
			startDictation('composer');
		}
	}, [dictationActive, stopDictation, setIsActive, setSource, startDictation]);

	// ============================================================
	// PTT flow (independent)
	// ============================================================
	const handlePTTStart = useCallback(async () => {
		if (!isWhisperReady || vadActive) return;
		try {
			const audioConstraints: MediaTrackConstraints = {
				echoCancellation: true,
				noiseSuppression: true,
				channelCount: 1,
			};
			if (micDeviceId) {
				(audioConstraints as any).deviceId = { exact: micDeviceId };
			}
			const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

			chunksRef.current = [];
			const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.start();
			setIsPTTRecording(true);
			const waveformStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
			pttWaveformStreamRef.current = waveformStream;
			onStreamChange?.(waveformStream);
		} catch (err) {
			console.error('[VoiceInput] Failed to start recording:', err);
		}
	}, [isWhisperReady, vadActive, micDeviceId, onStreamChange]);

	const handlePTTEnd = useCallback(async () => {
		if (!isPTTRecording || !mediaRecorderRef.current) return;

		const recorder = mediaRecorderRef.current;
		const audioBlob = await new Promise<Blob>((resolve) => {
			recorder.onstop = () => {
				const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
				resolve(blob);
				chunksRef.current = [];
			};
			recorder.stop();
			recorder.stream.getTracks().forEach(t => t.stop());
		});

		setIsPTTRecording(false);
		setIsPTTTranscribing(true);

		try {
			if (!activeWhisperServerId || !activeWhisperServer) return;
			const text = await transcribeAudioRaw(activeWhisperServerId, activeWhisperServer, audioBlob);
			if (text) onTranscript(text);
		} catch (err) {
			console.error('[VoiceInput] PTT transcription error:', err);
		} finally {
			setIsPTTTranscribing(false);
			pttWaveformStreamRef.current?.getTracks().forEach(t => t.stop());
			pttWaveformStreamRef.current = null;
			onStreamChange?.(null);
		}
	}, [isPTTRecording, activeWhisperServerId, activeWhisperServer, onTranscript, onStreamChange]);

	// ============================================================
	// VAD flow (independent)
	// ============================================================
	const handleVADToggle = useCallback(async () => {
		console.log('[VAD Chat] toggle clicked, vadActive:', vadActive, 'dictationActive:', dictationActive);
		if (dictationActive) { console.log('[VAD Chat] blocked: dictation active'); return; }
		if (vadActive) {
			console.log('[VAD Chat] stopping: destroying session, stopping tracks, setting vadActive=false');
			stopTTS();
			vadSessionRef.current?.destroy();
			vadSessionRef.current = null;
			vadWaveformStreamRef.current?.getTracks().forEach(t => t.stop());
			vadWaveformStreamRef.current = null;
			setWaveformStream(null);
			setVadActive(false);
			return;
		}

		if (!isWhisperReady) { console.log('[VAD Chat] blocked: whisper not ready'); return; }

		try {
			const audioConstraints: MediaTrackConstraints = {
				echoCancellation: true,
				noiseSuppression: true,
				channelCount: 1,
			};
			if (micDeviceId) {
				(audioConstraints as any).deviceId = { exact: micDeviceId };
			}
			console.log('[VAD Chat] starting: getting mic, serverId:', activeWhisperServerId);
			const waveformStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
			vadWaveformStreamRef.current = waveformStream;
			setWaveformStream(waveformStream);
		} catch (err) {
			console.error('[VAD Chat] failed to get waveform stream:', err);
			return;
		}

		const session = await createVADSession({
			onSpeechStart: () => {
				console.log('[VAD Chat] speech started: cancelling inference, stopping TTS');
				if (aui.composer().canCancel) {
					aui.composer().cancel();
				}
				stopTTS();
			},
			onSpeechEnd: async (audio: Float32Array) => {
				console.log('[VAD Chat] speech ended: isVADTranscribing:', isVADTranscribing, 'serverId:', activeWhisperServerId);
				setIsVADTranscribing(true);
				try {
					if (!activeWhisperServerId || !activeWhisperServer) { console.log('[VAD Chat] no active server, skipping'); return; }
					const wavBlob = float32ToWavBlob(audio);
					const text = await transcribeAudioRaw(activeWhisperServerId, activeWhisperServer, wavBlob);
					if (text) {
						console.log('[VAD Chat] transcribed:', JSON.stringify(text.slice(0, 80)));
						if (useStore.getState().annotatorVisible) {
							console.log('[VAD Chat] annotator visible, sending to popover');
							sendTextToPopover(text);
						} else {
							const annotations = useStore.getState().annotations;
							let fullText = text;
							if (annotations.length > 0) {
								const lines = annotations.map((a, i) => `${i + 1}. "${a.selectedText}"\n   ${a.comment}`);
								fullText = lines.join('\n\n') + '\n\n' + text;
								useStore.getState().clearAnnotations();
							}
							console.log('[VAD Chat] sending message via composer');
							aui.composer().setText(fullText);
							aui.composer().send({ startRun: true });
						}
					} else {
						console.log('[VAD Chat] empty transcription');
					}
				} catch (err) {
					console.error('[VAD Chat] transcription error:', err);
				} finally {
					console.log('[VAD Chat] transcription complete, isVADTranscribing → false');
					setIsVADTranscribing(false);
				}
			},
			onError: (err) => {
				console.error('[VAD Chat] ERROR — setting vadActive=false:', err);
				setVadActive(false);
			},
		});

		if (session) {
			vadSessionRef.current = session;
			await session.start();
			console.log('[VAD Chat] session started, setting vadActive=true');
			setVadActive(true);
		} else {
			console.log('[VAD Chat] session creation returned null');
		}
	}, [vadActive, isWhisperReady, activeWhisperServerId, activeWhisperServer, aui, micDeviceId, setWaveformStream, sendTextToPopover]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			vadSessionRef.current?.destroy();
			vadWaveformStreamRef.current?.getTracks().forEach(t => t.stop());
			pttWaveformStreamRef.current?.getTracks().forEach(t => t.stop());
			if (mediaRecorderRef.current?.state === 'recording') {
				mediaRecorderRef.current.stop();
				mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
			}
		};
	}, []);

	if (!isWhisperReady) {
		return null;
	}

	return (
		<HStack gap="2">
			{/* PTT Button — replaced by VAD dictation, hidden */}
			<Box display="none">
				<Box
					as="button"
					type="button"
					display="flex"
					alignItems="center"
					justifyContent="center"
					w="36px"
					h="36px"
					borderRadius="lg"
					borderWidth="1px"
					borderColor={isPTTRecording ? 'var(--wc-accent-red)' : 'var(--wc-border-default)'}
					bg={isPTTRecording ? 'var(--wc-accent-red-bg-15)' : 'var(--wc-bg-surface)'}
					cursor={vadActive ? 'not-allowed' : 'pointer'}
					opacity={vadActive ? 0.4 : 1}
					_hover={{ bg: vadActive ? undefined : 'var(--wc-bg-hover)' }}
					onClick={isPTTRecording ? handlePTTEnd : handlePTTStart}
					disabled={vadActive}
					title={vadActive ? 'Dictation disabled during voice chat' : isPTTRecording ? 'Stop recording' : 'Start recording (dictation)'}
				>
					{isPTTRecording ? (
						<Square size={16} color="var(--wc-accent-red)" fill="var(--wc-accent-red)" />
					) : isPTTTranscribing ? (
						<Loader2 size={16} color="var(--wc-accent-blue)" className="animate-spin" />
					) : (
						<Mic size={16} color="var(--wc-text-muted)" />
					)}
				</Box>
			</Box>

			{/* VAD Dictation Button */}
			<Box
				as="button"
				type="button"
				display="flex"
				alignItems="center"
				justifyContent="center"
				w="36px"
				h="36px"
				borderRadius="lg"
				borderWidth="1px"
				borderColor={dictationActive ? 'var(--wc-accent-red)' : 'var(--wc-border-default)'}
				bg={dictationActive ? 'var(--wc-accent-red-bg-15)' : 'var(--wc-bg-surface)'}
				cursor="pointer"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={handleDictationToggle}
				title={dictationActive ? 'Stop dictation' : 'Start dictation'}
				data-dictation-btn="composer"
			>
				{dictationTranscribing ? (
					<Loader2 size={16} color="var(--wc-accent-blue)" className="animate-spin" />
				) : dictationActive ? (
					<Square size={16} color="var(--wc-accent-red)" fill="var(--wc-accent-red)" />
				) : (
					<Mic size={16} color="var(--wc-text-muted)" />
				)}
			</Box>

			{/* VAD Chat Toggle — disabled when dictation active */}
			<Box
				as="button"
				type="button"
				display="flex"
				alignItems="center"
				justifyContent="center"
				w="36px"
				h="36px"
				borderRadius="lg"
				borderWidth="1px"
				borderColor={vadActive ? 'var(--wc-accent-green)' : 'var(--wc-border-default)'}
				bg={vadActive ? 'var(--wc-accent-green-bg-15)' : 'var(--wc-bg-surface)'}
				cursor={dictationActive ? 'not-allowed' : 'pointer'}
				opacity={dictationActive ? 0.4 : 1}
				_hover={{ bg: dictationActive ? undefined : 'var(--wc-bg-hover)' }}
				onClick={handleVADToggle}
				disabled={dictationActive}
				title={dictationActive ? 'Voice chat disabled during dictation' : vadActive ? 'Voice chat active (click to stop)' : 'Toggle voice chat mode'}
			>
				{isVADTranscribing ? (
					<Loader2 size={16} color="var(--wc-accent-green)" className="animate-spin" />
				) : (
					<RiVoiceprintLine size={16} color={vadActive ? 'var(--wc-accent-green)' : 'var(--wc-text-muted)'} />
				)}
			</Box>
		</HStack>
	);
});
