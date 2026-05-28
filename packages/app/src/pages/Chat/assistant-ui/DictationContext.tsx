import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { transcribeAudio, float32ToWavBlob } from './WhisperTranscribe';
import { parseWhisperThreadMeta } from './WhisperServerSelector';
import { EWhisperServerStatus } from '@warpcore/shared';

type DictationSource = 'composer' | 'popover' | null;

interface IVADSession {
	start: () => Promise<void>;
	destroy: () => void;
}

interface IDictationContext {
	isActive: boolean;
	isTranscribing: boolean;
	source: DictationSource;
	waveformStream: MediaStream | null;
	setWaveformStream: (stream: MediaStream | null) => void;
	start: (source: 'composer' | 'popover') => void;
	stop: () => void;
	subscribeTranscript: (fn: (text: string) => void) => () => void;
	popoverVisible: boolean;
	setPopoverVisible: (v: boolean) => void;
}

const DictationContext = createContext<IDictationContext | null>(null);

export function useDictation(): IDictationContext {
	const ctx = useContext(DictationContext);
	if (!ctx) throw new Error('useDictation must be used within DictationProvider');
	return ctx;
}

export const DictationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [isActive, setIsActive] = useState(false);
	const [isTranscribing, setIsTranscribing] = useState(false);
	const [source, setSource] = useState<DictationSource>(null);
	const [waveformStream, setWaveformStream] = useState<MediaStream | null>(null);
	const [popoverVisible, setPopoverVisible] = useState(false);

	const vadSessionRef = useRef<IVADSession | null>(null);
	const audioStreamRef = useRef<MediaStream | null>(null);
	const callbacksRef = useRef<Set<(text: string) => void>>(new Set());

	const whisperServers = useStore(s => s.whisperServers);
	const currentThreadId = useStore(s => s.currentThreadId);
	const tempWhisperServerId = useStore(s => s.tempThreadWhisperServerId);
	const thread = useStore(s => currentThreadId ? s.threads[currentThreadId] : null);
	const micDeviceId = useStore(s => s.settings.micDeviceId);

	const assignedWhisperServerId = React.useMemo(
		() => thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
		[thread]
	);
	const activeWhisperServerId = React.useMemo(
		() => assignedWhisperServerId ?? tempWhisperServerId,
		[assignedWhisperServerId, tempWhisperServerId]
	);
	const activeWhisperServer = React.useMemo(
		() => activeWhisperServerId ? whisperServers[activeWhisperServerId] : null,
		[activeWhisperServerId, whisperServers]
	);

	const stop = useCallback(() => {
		vadSessionRef.current?.destroy();
		vadSessionRef.current = null;
		audioStreamRef.current?.getTracks().forEach(t => t.stop());
		audioStreamRef.current = null;
		setWaveformStream(null);
		setIsActive(false);
		setSource(null);
	}, []);

	const start = useCallback(async (src: 'composer' | 'popover') => {
		if (isActive) return;
		if (!activeWhisperServerId || !activeWhisperServer) return;
		if (activeWhisperServer.status !== EWhisperServerStatus.RUNNING) return;

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
			audioStreamRef.current = stream;
			setWaveformStream(stream);

			const { MicVAD } = await import('@ricky0123/vad-web');
			const vad = await MicVAD.new({
				onSpeechStart: () => {
					// No-op for dictation mode
				},
				onSpeechEnd: async (audio: Float32Array) => {
					setIsTranscribing(true);
					try {
						const wavBlob = float32ToWavBlob(audio);
						const text = await transcribeAudio(activeWhisperServerId, wavBlob);
						if (text) {
							callbacksRef.current.forEach(cb => cb(text));
						}
					} catch (err) {
						console.error('[Dictation] Transcription error:', err);
					} finally {
						setIsTranscribing(false);
					}
				},
				onError: (err: Error) => {
					console.error('[Dictation] VAD error:', err);
					stop();
				},
				baseAssetPath: '/vad/',
				model: 'v5',
				onnxWASMBasePath: '/onnxruntime/',
				startOnLoad: false,
				submitUserSpeechOnPause: true,
			});

			vadSessionRef.current = {
				start: async () => vad.start(),
				destroy: () => vad.destroy(),
			};
			await vad.start();
			setIsActive(true);
			setSource(src);
		} catch (err) {
			console.error('[Dictation] Failed to start:', err);
		}
	}, [isActive, activeWhisperServerId, activeWhisperServer, micDeviceId, stop]);

	const subscribeTranscript = useCallback((fn: (text: string) => void) => {
		callbacksRef.current.add(fn);
		return () => {
			callbacksRef.current.delete(fn);
		};
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			stop();
		};
	}, [stop]);

	const value = React.useMemo<IDictationContext>(() => ({
		isActive,
		isTranscribing,
		source,
		waveformStream,
		setWaveformStream,
		start,
		stop,
		subscribeTranscript,
		popoverVisible,
		setPopoverVisible,
	}), [isActive, isTranscribing, source, waveformStream, start, stop, subscribeTranscript, popoverVisible]);

	return (
		<DictationContext.Provider value={value}>
			{children}
		</DictationContext.Provider>
	);
};
