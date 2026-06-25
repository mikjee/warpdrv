import express, { Router } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createSession } from 'better-sse';
import { startDownload } from '../services/downloadManager';
import { isKokoroReady, registerStream, abortStream, consumeStream } from '../services/kokoroService';
export const kokoroRouter = Router();
const KOKORO_AUTHOR = 'onnx-community';
const KOKORO_MODEL = 'Kokoro-82M-v1.0-ONNX';
const KOKORO_MODEL_FILE = 'onnx/model.onnx';
const KOKORO_CONFIG_FILE = 'config.json';
const KOKORO_TOKENIZER_FILES = ['tokenizer.json', 'tokenizer_config.json'];
const KOKORO_VOICE_FILES = [
	'voices/af_heart.bin',
	'voices/af_bella.bin',
	'voices/af_nicole.bin',
	'voices/am_adam.bin',
	'voices/am_michael.bin',
	'voices/bf_emma.bin',
	'voices/bm_george.bin',
];
function kokoroDir(): string {
	return path.join(os.homedir(), '.config', 'warpcore', 'kokoro');
}
function kokoroBasePath(): string {
	return path.join(kokoroDir(), KOKORO_AUTHOR, KOKORO_MODEL);
}
function kokoroModelPath(): string {
	return path.join(kokoroBasePath(), KOKORO_MODEL_FILE);
}
function kokoroConfigPath(): string {
	return path.join(kokoroBasePath(), KOKORO_CONFIG_FILE);
}
function kokoroVoicePaths(): string[] {
	return KOKORO_VOICE_FILES.map(f => path.join(kokoroBasePath(), f));
}
function kokoroTokenizerPaths(): string[] {
	return KOKORO_TOKENIZER_FILES.map(f => path.join(kokoroBasePath(), f));
}
kokoroRouter.use('/kokoro-model', express.static(kokoroBasePath()));
kokoroRouter.get('/status', async (_req, res) => {
	const modelPath = kokoroModelPath();
	const configPath = kokoroConfigPath();
	const voicePaths = kokoroVoicePaths();
	const tokenizerPaths = kokoroTokenizerPaths();
	const modelExists = fs.existsSync(modelPath);
	const configExists = fs.existsSync(configPath);
	const voicesExist = voicePaths.every(p => fs.existsSync(p));
	const tokenizersExist = tokenizerPaths.every(p => fs.existsSync(p));
	const installed = modelExists && configExists && voicesExist && tokenizersExist;
	res.json({
		ok: true,
		data: {
			installed,
			basePath: kokoroBasePath(),
			modelPath,
			configPath,
			voicePaths,
		},
		error: null,
	});
});
kokoroRouter.post('/tts/start', express.json(), (req, res) => {
	const { text, voice } = req.body || {};
	if (!isKokoroReady()) {
		res.json({ ok: false, data: null, error: 'kokoro not ready' });
		return;
	}
	if (typeof text !== 'string' || typeof voice !== 'string') {
		res.json({ ok: false, data: null, error: 'invalid params' });
		return;
	}
	const streamId = registerStream(text, voice);
	res.json({ ok: true, data: { streamId }, error: null });
});
kokoroRouter.get('/tts/stream/:streamId', async (req, res) => {
	const { streamId } = req.params;
	const session = await createSession(req, res);
	try {
		for await (const wav of consumeStream(streamId)) {
			session.push({ audio: wav.toString('base64') }, 'chunk');
		}
		session.push({}, 'done');
	} catch (err: any) {
		session.push({ message: String(err?.message ?? err) }, 'error');
	}
});
kokoroRouter.post('/tts/abort/:streamId', (req, res) => {
	abortStream(req.params.streamId);
	res.json({ ok: true, data: null, error: null });
});
kokoroRouter.post('/install', async (_req, res) => {
	try {
		const groupKey = `kokoro-${Date.now()}`;
		const destRoot = kokoroDir();
		const allFiles = [KOKORO_MODEL_FILE, KOKORO_CONFIG_FILE, ...KOKORO_TOKENIZER_FILES, ...KOKORO_VOICE_FILES];
		const downloads = [];
		for (let i = 0; i < allFiles.length; i++) {
			const dl = await startDownload(
				KOKORO_AUTHOR,
				KOKORO_MODEL,
				allFiles[i],
				destRoot,
				allFiles,
				i,
				groupKey,
			);
			downloads.push(dl);
		}
		res.json({ ok: true, data: { groupKey, downloads }, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});
