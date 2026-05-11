import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Box, HStack, Text, Spinner } from '@chakra-ui/react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { RiVoiceprintLine } from 'react-icons/ri';
import { useStore } from '@/store';
import { EWhisperServerStatus } from '@warpcore/shared';
import { createVADSession, float32ToWavBlob } from './VADManager';
import { parseWhisperThreadMeta } from './WhisperServerSelector';

interface IVoiceInputProps {
	threadId: string | null;
	onTranscript: (text: string) => void;
}

type RecordingState = 'idle' | 'recording' | 'transcribing' | 'vad-active';

export const VoiceInput = React.memo(({ threadId, onTranscript }: IVoiceInputProps) => {
	const [state, setState] = useState<RecordingState>('idle');
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const vadSessionRef = useRef<ReturnType<typeof createVADSession> | null>(null);

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

	// PTT: Hold to record, release to transcribe
	const handlePTTStart = useCallback(async () => {
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
			const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

			chunksRef.current = [];
			const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
			mediaRecorderRef.current = recorder;

			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};

			recorder.start();
			setState('recording');
		} catch (err) {
			console.error('[VoiceInput] Failed to start recording:', err);
		}
	}, [isWhisperReady]);

	const handlePTTEnd = useCallback(async () => {
		if (state !== 'recording' || !mediaRecorderRef.current) return;

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

		setState('transcribing');
		await transcribeAudio(audioBlob);
	}, [state]);

	// Voice chat mode: VAD-managed recording
	const handleVADToggle = useCallback(async () => {
		if (state === 'vad-active') {
			// Stop VAD session
			vadSessionRef.current?.destroy();
			vadSessionRef.current = null;
			setState('idle');
			return;
		}

		if (!isWhisperReady) return;

		const session = await createVADSession({
			onSpeechStart: () => setState('recording'),
			onSpeechEnd: async (audio: Float32Array) => {
				setState('transcribing');
				const wavBlob = float32ToWavBlob(audio);
				await transcribeAudio(wavBlob);
			},
			onError: (err) => {
				console.error('[VoiceInput] VAD error:', err);
				setState('idle');
			},
		});

		if (session) {
			vadSessionRef.current = session;
			await session.start();
			setState('vad-active');
		}
	}, [state, isWhisperReady]);

	// Send audio directly to whisper server
	const transcribeAudio = useCallback(async (audioBlob: Blob) => {
		if (!activeWhisperServerId || !activeWhisperServer) {
			setState('idle');
			return;
		}

		try {
			const formData = new FormData();
			formData.append('file', audioBlob, 'audio.webm');

			const response = await fetch(`http://127.0.0.1:${activeWhisperServer.port}${activeWhisperServer.params.inferencePath}`, {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`Transcription failed: ${response.status}`);
			}

			const result = await response.json();
			const text = result.text?.trim() ?? '';

			if (text) {
				onTranscript(text);
			}
		} catch (err) {
			console.error('[VoiceInput] Transcription error:', err);
		} finally {
			setState('idle');
		}
	}, [activeWhisperServerId, activeWhisperServer, onTranscript]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			vadSessionRef.current?.destroy();
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
			{/* PTT Button */}
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
				borderColor={state === 'recording' ? 'var(--wc-accent-red)' : 'var(--wc-border-default)'}
				bg={state === 'recording' ? 'var(--wc-accent-red-bg-15)' : 'var(--wc-bg-surface)'}
				cursor="pointer"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={() => {
					if (state === 'recording') {
						handlePTTEnd();
					} else {
						handlePTTStart();
					}
				}}
				title={state === 'recording' ? 'Stop recording' : 'Start recording (dictation)'}
			>
				{state === 'recording' ? (
					<Square size={16} color="var(--wc-accent-red)" fill="var(--wc-accent-red)" />
				) : state === 'transcribing' ? (
					<Loader2 size={16} color="var(--wc-accent-blue)" className="animate-spin" />
				) : (
					<Mic size={16} color="var(--wc-text-muted)" />
				)}
			</Box>

			{/* VAD Toggle */}
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
				borderColor={state === 'vad-active' ? 'var(--wc-accent-green)' : 'var(--wc-border-default)'}
				bg={state === 'vad-active' ? 'var(--wc-accent-green-bg-15)' : 'var(--wc-bg-surface)'}
				cursor="pointer"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={handleVADToggle}
				title={state === 'vad-active' ? 'Voice chat active (click to stop)' : 'Toggle voice chat mode'}
			>
				{state === 'vad-active' ? (
					<RiVoiceprintLine size={16} color="var(--wc-accent-green)" />
				) : (
					<RiVoiceprintLine size={16} color="var(--wc-text-muted)" />
				)}
			</Box>
		</HStack>
	);
});
