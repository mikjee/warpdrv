// VAD Manager - wraps @ricky0123/vad-web for voice activity detection
// Bundled ONNX model loaded from local assets

let vadInstance: any = null;
let vadInitialized = false;

interface IVADCallbacks {
	onSpeechStart: () => void;
	onSpeechEnd: (audio: Float32Array) => void;
	onError?: (error: Error) => void;
}

export async function initVAD(): Promise<boolean> {
	if (vadInitialized) return true;
	try {
		const { MicVAD } = await import('@ricky0123/vad-web');
		vadInstance = MicVAD;
		vadInitialized = true;
		return true;
	} catch (err) {
		console.error('[VADManager] Failed to initialize VAD:', err);
		return false;
	}
}

export interface IVADSession {
	start: () => Promise<void>;
	stop: () => void;
	destroy: () => void;
}

export async function createVADSession(callbacks: IVADCallbacks): Promise<IVADSession | null> {
	if (!vadInitialized) {
		const ok = await initVAD();
		if (!ok) return null;
	}

	try {
		const vad = await vadInstance.new({
			onSpeechStart: () => callbacks.onSpeechStart(),
			onSpeechEnd: (audio: Float32Array) => callbacks.onSpeechEnd(audio),
			onError: (error: Error) => callbacks.onError?.(error) || console.error('[VADSession] Error:', error),
			baseAssetPath: '/vad/',
			model: 'v5',
			onnxWASMBasePath: '/onnxruntime/',
			startOnLoad: false,
		});

		return {
			start: async () => vad.start(),
			stop: () => vad.stop(),
			destroy: () => vad.destroy(),
		};
	} catch (err) {
		alert(`VAD init failed: ${(err as Error).message}\n${(err as Error).stack}`);
		console.error('[VADManager] Failed to create VAD session:', err);
		return null;
	}
}

// Convert Float32Array (16kHz mono PCM) to WAV blob
export function float32ToWavBlob(samples: Float32Array, sampleRate: number = 16000): Blob {
	const numChannels = 1;
	const bitsPerSample = 16;
	const byteLength = samples.length * (bitsPerSample / 8);
	const buffer = new ArrayBuffer(44 + byteLength);
	const view = new DataView(buffer);

	// WAV header
	writeString(view, 0, 'RIFF');
	view.setUint32(4, 36 + byteLength, true);
	writeString(view, 8, 'WAVE');
	writeString(view, 12, 'fmt ');
	view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
	view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
	view.setUint16(22, numChannels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
	view.setUint16(32, numChannels * (bitsPerSample / 8), true);
	view.setUint16(34, bitsPerSample, true);
	writeString(view, 36, 'data');
	view.setUint32(40, byteLength, true);

	// Write samples
	let offset = 44;
	for (let i = 0; i < samples.length; i++) {
		const sample = Math.max(-1, Math.min(1, samples[i]));
		const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
		view.setInt16(offset, intSample, true);
		offset += 2;
	}

	return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string): void {
	for (let i = 0; i < str.length; i++) {
		view.setUint8(offset + i, str.charCodeAt(i));
	}
}
