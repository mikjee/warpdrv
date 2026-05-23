let kokoroInstance: any = null;
let isReady = false;
let currentRequestId: number = 0;
let activeRequestId: number = 0;

interface InitMessage {
	type: 'init';
	baseUrl: string;
	modelUrl: string;
}

interface StreamMessage {
	type: 'stream';
	requestId: number;
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
		activeRequestId = 0;
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
		self.postMessage({ type: 'error', requestId: msg.requestId, message: 'Worker not initialized' });
		return;
	}

	activeRequestId = msg.requestId;
	const myRequestId = msg.requestId;

	try {
		const { TextSplitterStream } = await import('kokoro-js');
		const splitter = new TextSplitterStream();
		const stream = kokoroInstance.stream(splitter, { voice: msg.voice });
		splitter.push(msg.text);
		splitter.close();

		for await (const chunk of stream) {
			if (activeRequestId !== myRequestId) {
				self.postMessage({ type: 'done', requestId: myRequestId });
				return;
			}
			const audio = chunk.audio as any;
			const wavBuffer = audio.toWav();
			self.postMessage({ type: 'chunk', requestId: myRequestId, audio: wavBuffer }, [wavBuffer]);
		}
		self.postMessage({ type: 'done', requestId: myRequestId });
	} catch (err: any) {
		self.postMessage({ type: 'error', requestId: myRequestId, message: err?.message ?? String(err) });
	}
}
