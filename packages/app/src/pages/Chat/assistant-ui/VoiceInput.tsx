import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, HStack } from '@chakra-ui/react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { RiVoiceprintLine } from 'react-icons/ri';
import { useStore } from '@/store';
import { EWhisperServerStatus } from '@warpcore/shared';
import { createVADSession, float32ToWavBlob } from './VADManager';
import { parseWhisperThreadMeta } from './WhisperServerSelector';
import type { AssistantClient } from '@assistant-ui/react';

interface IVoiceInputProps {
	threadId: string | null;
	onTranscript: (text: string) => void;
	aui: AssistantClient;
	onStreamChange?: (stream: MediaStream | null) => void;
}

// Shared: pure transcription, no state side effects
async function transcribeAudioRaw(serverId: string, server: any, audioBlob: Blob): Promise<string | null> {
	const formData = new FormData();
	formData.append('file', audioBlob, 'audio.webm');

	const response = await fetch(`http://127.0.0.1:${server.port}${server.params.inferencePath}`, {
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
	// PTT state (independent)
	const [isPTTRecording, setIsPTTRecording] = useState(false);
	const [isPTTTranscribing, setIsPTTTranscribing] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const pttWaveformStreamRef = useRef<MediaStream | null>(null);

	// VAD state (independent)
	const [vadActive, setVadActive] = useState(false);
	const [isVADTranscribing, setIsVADTranscribing] = useState(false);
	const vadSessionRef = useRef<ReturnType<typeof createVADSession> | null>(null);
	const vadWaveformStreamRef = useRef<MediaStream | null>(null);

	const whisperServers = useStore(s => s.whisperServers);
	const tempWhisperServerId = useStore(s => s.tempThreadWhisperServerId);
	const thread = useStore(s => threadId ? s.threads[threadId] : null);
	const micDeviceId = useStore(s => s.settings.micDeviceId);

	const assignedWhisperServerId = useMemo(
		() => thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
		[thread]
	);
	const activeWhisperServerId = useMemo(
		() => assignedWhisperServerId ?? tempWhisperServerId,
		[assignedWhisperServerId, tempWhisperServerId]
	);
	const activeWhisperServer = useMemo(
		() => activeWhisperServerId ? whisperServers[activeWhisperServerId] : null,
		[activeWhisperServerId, whisperServers]
	);
	const isWhisperReady = activeWhisperServer?.status === EWhisperServerStatus.RUNNING;

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
		if (vadActive) {
			vadSessionRef.current?.destroy();
			vadSessionRef.current = null;
			vadWaveformStreamRef.current?.getTracks().forEach(t => t.stop());
			vadWaveformStreamRef.current = null;
			onStreamChange?.(null);
			setVadActive(false);
			return;
		}

		if (!isWhisperReady) return;

		try {
			const audioConstraints: MediaTrackConstraints = {
				echoCancellation: true,
				noiseSuppression: true,
				channelCount: 1,
			};
			if (micDeviceId) {
				(audioConstraints as any).deviceId = { exact: micDeviceId };
			}
			const waveformStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
			vadWaveformStreamRef.current = waveformStream;
			onStreamChange?.(waveformStream);
		} catch (err) {
			console.error('[VoiceInput] Failed to get waveform stream:', err);
			return;
		}

		const session = await createVADSession({
			onSpeechStart: () => {
				// Cancel inference if running
				if (aui.composer().canCancel) {
					aui.composer().cancel();
				}
			},
			onSpeechEnd: async (audio: Float32Array) => {
				setIsVADTranscribing(true);
				try {
					if (!activeWhisperServerId || !activeWhisperServer) return;
					const wavBlob = float32ToWavBlob(audio);
					const text = await transcribeAudioRaw(activeWhisperServerId, activeWhisperServer, wavBlob);
					if (text) {
						aui.composer().setText(text);
						aui.composer().send({ startRun: true });
					}
				} catch (err) {
					console.error('[VoiceInput] VAD transcription error:', err);
				} finally {
					setIsVADTranscribing(false);
					// vadActive stays true - conversation loop continues
				}
			},
			onError: (err) => {
				console.error('[VoiceInput] VAD error:', err);
				setVadActive(false);
			},
		});

		if (session) {
			vadSessionRef.current = session;
			await session.start();
			setVadActive(true);
		}
	}, [vadActive, isWhisperReady, activeWhisperServerId, activeWhisperServer, aui, micDeviceId, onStreamChange]);

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
			{/* PTT Button - disabled when VAD active */}
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

			{/* VAD Toggle - disabled when PTT recording */}
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
				cursor={isPTTRecording ? 'not-allowed' : 'pointer'}
				opacity={isPTTRecording ? 0.4 : 1}
				_hover={{ bg: isPTTRecording ? undefined : 'var(--wc-bg-hover)' }}
				onClick={handleVADToggle}
				disabled={isPTTRecording}
				title={isPTTRecording ? 'Voice chat disabled during dictation' : vadActive ? 'Voice chat active (click to stop)' : 'Toggle voice chat mode'}
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
