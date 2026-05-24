import path from 'path';
import os from 'os';
let kokoroInstance: any = null;
let isReady = false;
const KOKORO_AUTHOR = 'onnx-community';
const KOKORO_MODEL = 'Kokoro-82M-v1.0-ONNX';
function kokoroBasePath(): string {
	return path.join(os.homedir(), '.config', 'warpcore', 'kokoro', KOKORO_AUTHOR, KOKORO_MODEL);
}
export interface IPendingStream {
	text: string;
	voice: string;
	createdAt: number;
	aborted: boolean;
}
const pendingStreams: Record<string, IPendingStream> = {};
const STREAM_TTL_MS = 30_000;
setInterval(() => {
	const now = Date.now();
	for (const id of Object.keys(pendingStreams)) {
		if (now - pendingStreams[id].createdAt > STREAM_TTL_MS) delete pendingStreams[id];
	}
}, 10_000);
export async function initKokoroService(): Promise<void> {
	if (isReady) return;
	try {
		const { KokoroTTS, setVoiceDataUrl, env: kokoroEnv } = await import('kokoro-js');
		const { env } = await import('@huggingface/transformers');
		const basePath = kokoroBasePath();
		env.allowLocalModels = true;
		env.localModelPath = path.join(os.homedir(), '.config', 'warpcore', 'kokoro');
		env.allowRemoteModels = false;
		setVoiceDataUrl(path.join(basePath, 'voices'));
		kokoroInstance = await KokoroTTS.from_pretrained(`${KOKORO_AUTHOR}/${KOKORO_MODEL}`, {
			dtype: 'fp32',
			device: 'cpu',
		});
		isReady = true;
		console.log('[Kokoro] Model loaded');
	} catch (err) {
		console.error('[Kokoro] Init failed:', err);
		throw err;
	}
}
export function isKokoroReady(): boolean {
	return isReady;
}
export function registerStream(text: string, voice: string): string {
	const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
	pendingStreams[id] = { text, voice, createdAt: Date.now(), aborted: false };
	return id;
}
export function abortStream(streamId: string): void {
	const p = pendingStreams[streamId];
	if (p) p.aborted = true;
}
export async function* consumeStream(streamId: string): AsyncGenerator<Buffer> {
	const p = pendingStreams[streamId];
	if (!p) throw new Error('stream not found');
	delete pendingStreams[streamId];
	if (!isReady || !kokoroInstance) throw new Error('kokoro not ready');
	const { TextSplitterStream } = await import('kokoro-js');
	const splitter = new TextSplitterStream();
	const stream = kokoroInstance.stream(splitter, { voice: p.voice });
	splitter.push(p.text);
	splitter.close();
	for await (const chunk of stream) {
		if (p.aborted) return;
		const wav = chunk.audio.toWav();
		yield Buffer.from(wav);
	}
}
