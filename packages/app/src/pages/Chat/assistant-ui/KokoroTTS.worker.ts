let kokoroInstance: any = null;
let isReady = false;
let stopRequested = false;

interface InitMessage {
	type: 'init';
	baseUrl: string;
	modelUrl: string;
}

interface StreamMessage {
	type: 'stream';
	text: string;
	voice: string;
}

interface StopMessage {
	type: 'stop';
}

interface DestroyMessage {
	type: 'destroy';
}

type IncomingMessage = InitMessage | StreamMessage | StopMessage | DestroyMessage;

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
	const msg = e.data;

	if (msg.type === 'init') {
		handleInit(msg);
	} else if (msg.type === 'stream') {
		handleStream(msg);
	} else if (msg.type === 'stop') {
		stopRequested = true;
	} else if (msg.type === 'destroy') {
		self.close();
	}
};

async function handleInit(msg: InitMessage) {
	try {
		const { KokoroTTS, setVoiceDataUrl, env: kokoroEnv } = await import('kokoro-js');
		const { env } = await import('@huggingface/transformers');

		kokoroEnv.wasmPaths = '/onnxruntime/';
		env.remoteHost = msg.baseUrl;
		env.remotePathTemplate = msg.modelUrl.replace(msg.baseUrl, '');
		env.allowLocalModels = false;
		setVoiceDataUrl(`${msg.modelUrl}/voices`);

		const device = typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'wasm';
		console.log('[Worker] Using device:', device);
		kokoroInstance = await KokoroTTS.from_pretrained('kokoro', {
			dtype: 'fp32',
			device,
		});
		isReady = true;
		self.postMessage({ type: 'ready' });
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err?.message ?? String(err) });
	}
}

async function handleStream(msg: StreamMessage) {
	if (!kokoroInstance || !isReady) {
		self.postMessage({ type: 'error', message: 'Worker not initialized' });
		return;
	}

	stopRequested = false;

	try {
		for await (const chunk of kokoroInstance.stream(msg.text, { voice: msg.voice })) {
			if (stopRequested) {
				self.postMessage({ type: 'done' });
				return;
			}
			const audio = chunk.audio as any;
			const wavBuffer = audio.toWav();
			self.postMessage({ type: 'chunk', audio: wavBuffer }, [wavBuffer]);
		}
		self.postMessage({ type: 'done' });
	} catch (err: any) {
		self.postMessage({ type: 'error', message: err?.message ?? String(err) });
	}
}
