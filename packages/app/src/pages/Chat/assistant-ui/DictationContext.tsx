import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useStore } from '@/store';
import { transcribeAudio, float32ToWavBlob } from './WhisperTranscribe';
// COMMENTED OUT: per-thread whisper server selection no longer used
// import { parseWhisperThreadMeta } from './WhisperServerSelector';
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
	sendTextToPopover: (text: string) => void;
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

	const vadSessionRef = useRef<IVADSession | null>(null);
	const audioStreamRef = useRef<MediaStream | null>(null);
	const callbacksRef = useRef<Set<(text: string) => void>>(new Set());
	const isStartingRef = useRef(false);
	const shouldStopRef = useRef(false);
	const vadActiveRef = useRef(false);

	const whisperServers = useStore(s => s.whisperServers);
	const selectedWhisperServerId = useStore(s => s.selectedWhisperServerId);
	const micDeviceId = useStore(s => s.settings.micDeviceId);
	const vadActive = useStore(s => s.vadActive);
	useEffect(() => { vadActiveRef.current = vadActive; }, [vadActive]);

	// COMMENTED OUT: per-thread whisper server selection no longer used
	// const currentThreadId = useStore(s => s.currentThreadId);
	// const tempWhisperServerId = useStore(s => s.tempThreadWhisperServerId);
	// const thread = useStore(s => currentThreadId ? s.threads[currentThreadId] : null);
	// const assignedWhisperServerId = React.useMemo(
	// 	() => thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
	// 	[thread]
	// );
	// const activeWhisperServerId = React.useMemo(
	// 	() => assignedWhisperServerId ?? tempWhisperServerId,
	// 	[assignedWhisperServerId, tempWhisperServerId]
	// );

	const activeWhisperServer = React.useMemo(
		() => selectedWhisperServerId ? whisperServers[selectedWhisperServerId] : null,
		[selectedWhisperServerId, whisperServers]
	);

	const stop = useCallback(() => {
		console.log('[Dictation] stopping: isActive→false, destroying session, stopping tracks');
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
		console.log('[Dictation] start called, isActive:', isActive, 'serverId:', selectedWhisperServerId, 'serverStatus:', activeWhisperServer?.status);
		if (isActiveRef.current) { console.log('[Dictation] start skipped: already active'); return; }
		if (!selectedWhisperServerId || !activeWhisperServer) { console.log('[Dictation] start skipped: no server'); return; }
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
				onSpeechStart: () => { console.log('[Dictation] speech started'); },
				onSpeechEnd: async (audio: Float32Array) => {
					console.log('[Dictation] speech ended: isTranscribing:', isTranscribing);
					setIsTranscribing(true);
					try {
						const wavBlob = float32ToWavBlob(audio);
						const text = await transcribeAudio(selectedWhisperServerId, wavBlob);
						if (text) {
							console.log('[Dictation] transcribed:', JSON.stringify(text.slice(0, 80)));
							callbacksRef.current.forEach(cb => cb(text));
						} else {
							console.log('[Dictation] empty transcription');
						}
					} catch (err) {
						console.error('[Dictation] Transcription error:', err);
					} finally {
						console.log('[Dictation] transcription complete, isTranscribing → false');
						setIsTranscribing(false);
					}
				},
				onError: (err: Error) => {
					console.error('[Dictation] ERROR — calling stop():', err);
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
				console.log('[Dictation] stop requested during start, cleaning up');
				vadSessionRef.current?.destroy();
				vadSessionRef.current = null;
				stream.getTracks().forEach(t => t.stop());
				audioStreamRef.current = null;
				setWaveformStream(null);
				setIsActive(false);
				setSource(null);
				return;
			}
			console.log('[Dictation] vad started successfully');
		} catch (err) {
			console.error('[Dictation] start error:', err);
		} finally {
			isStartingRef.current = false;
		}
	}, [selectedWhisperServerId, activeWhisperServer, micDeviceId, stop]);

	const subscribeTranscript = useCallback((fn: (text: string) => void) => {
		callbacksRef.current.add(fn);
		return () => {
			callbacksRef.current.delete(fn);
		};
	}, []);

	const sendTextToPopover = useCallback((text: string) => {
		callbacksRef.current.forEach(cb => cb(text));
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
			if (vadActiveRef.current) { console.log('[Dictation] PTT keydown blocked: vadActive'); return; }
			isKeyDownRef.current = true;
			e.preventDefault();
			e.stopPropagation();
			const src = useStore.getState().annotatorVisible ? 'popover' : 'composer';
			console.log('[Dictation] PTT keydown: src=', src, 'isActive→true');
			setIsActive(true);
			setSource(src);
			start(src);
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (e.key !== dictationPTTKey) return;
			if (vadActiveRef.current) return;
			isKeyDownRef.current = false;
			e.preventDefault();
			e.stopPropagation();
			console.log('[Dictation] PTT keyup: calling stop');
			stop();
		};

		document.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('keyup', handleKeyUp, true);
		return () => {
			document.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keyup', handleKeyUp, true);
		};
	}, [dictationPTTKey, start, stop]);

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
		sendTextToPopover,
	}), [isActive, isTranscribing, source, waveformStream, start, stop, subscribeTranscript, sendTextToPopover]);

	return (
		<DictationContext.Provider value={value}>
			{children}
		</DictationContext.Provider>
	);
};
