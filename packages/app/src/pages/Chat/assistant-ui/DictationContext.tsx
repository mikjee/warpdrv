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
	setIsActive: (v: boolean) => void;
	setSource: (s: DictationSource) => void;
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
	const isStartingRef = useRef(false);
	const shouldStopRef = useRef(false);

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
		setIsActive(false);
		setSource(null);
		if (isStartingRef.current) {
			shouldStopRef.current = true;
			return;
		}
		vadSessionRef.current?.destroy();
		vadSessionRef.current = null;
		audioStreamRef.current?.getTracks().forEach(t => t.stop());
		audioStreamRef.current = null;
		setWaveformStream(null);
	}, []);

	const start = useCallback(async (src: 'composer' | 'popover') => {
		console.log('[Dictation] start called, isActive:', isActive, 'serverId:', activeWhisperServerId, 'serverStatus:', activeWhisperServer?.status);
		if (isActiveRef.current) { console.log('[Dictation] start skipped: already active'); return; }
		if (!activeWhisperServerId || !activeWhisperServer) { console.log('[Dictation] start skipped: no server'); return; }
		if (activeWhisperServer.status !== EWhisperServerStatus.RUNNING) { console.log('[Dictation] start skipped: server not running'); return; }

		isStartingRef.current = true;
		shouldStopRef.current = false;

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
			if (shouldStopRef.current) { stream.getTracks().forEach(t => t.stop()); return; }
			audioStreamRef.current = stream;
			setWaveformStream(stream);

			const { MicVAD } = await import('@ricky0123/vad-web');
			const vad = await MicVAD.new({
				onSpeechStart: () => {},
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
			if (shouldStopRef.current) { stream.getTracks().forEach(t => t.stop()); audioStreamRef.current = null; setWaveformStream(null); return; }

			vadSessionRef.current = {
				start: async () => vad.start(),
				destroy: () => vad.destroy(),
			};
			await vad.start();
			if (shouldStopRef.current) {
				vadSessionRef.current?.destroy();
				vadSessionRef.current = null;
				stream.getTracks().forEach(t => t.stop());
				audioStreamRef.current = null;
				setWaveformStream(null);
				setIsActive(false);
				setSource(null);
				return;
			}
			console.log('[Dictation] start succeeded');
		} catch (err) {
			console.error('[Dictation] start error:', err);
		} finally {
			isStartingRef.current = false;
		}
	}, [activeWhisperServerId, activeWhisperServer, micDeviceId, stop]);

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

	// PTT keyboard shortcut
	const dictationPTTKey = useStore(s => s.settings.dictationPTTKey);
	const isActiveRef = useRef(false);
	const isKeyDownRef = useRef(false);
	useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

	useEffect(() => {
		if (!dictationPTTKey) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key !== dictationPTTKey) return;
			if (isKeyDownRef.current) return;
			isKeyDownRef.current = true;
			e.preventDefault();
			e.stopPropagation();
			setIsActive(true);
			setSource(popoverVisible ? 'popover' : 'composer');
			start(popoverVisible ? 'popover' : 'composer');
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key !== dictationPTTKey) return;
			isKeyDownRef.current = false;
			e.preventDefault();
			e.stopPropagation();
			stop();
		};

		document.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('keyup', handleKeyUp, true);
		return () => {
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keyup', handleKeyUp, true);
		};
	}, [dictationPTTKey, popoverVisible, start, stop]);

	const value = React.useMemo<IDictationContext>(() => ({
		isActive,
		isTranscribing,
		source,
		waveformStream,
		setWaveformStream,
		setIsActive,
		setSource,
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
