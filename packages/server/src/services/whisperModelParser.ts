import fs from 'fs/promises';
import path from 'path';
import { gguf } from '@huggingface/gguf';
import type { IWhisperModelMetadata, IWhisperModelFile, TWhisperModelSize, TWhisperFtype } from '@warpcore/shared';

// Parse whisper model metadata from GGUF header (dead code - GGUF scanning disabled)
export async function parseWhisperMetadata(filePath: string): Promise<IWhisperModelMetadata | null> {
	try {
		const ggufData = await gguf(filePath, { allowLocalFile: true });
		const meta = ggufData.metadata as Record<string, unknown>;

		const architecture = String(meta['general.architecture'] ?? 'unknown');
		const fileStat = await fs.stat(filePath);

		// Whisper-specific fields
		const languages = (meta['whisper.languages'] as string)
			? (meta['whisper.languages'] as string).split(',').map(l => l.trim())
			: [];
		const vocabSize = Number(meta['tokenizer.vocab_size'] ?? 0);
		const encoderDim = Number(meta['whisper.encoder.embedding_length'] ?? 0);
		const contextLength = Number(meta['whisper.encoder.context_length'] ?? 0);
		const textContextLength = Number(meta['whisper.decoder.context_length'] ?? 0);
		const textState = Number(meta['whisper.decoder.embedding_length'] ?? 0);
		const audioLayers = Number(meta['whisper.encoder.n_layer'] ?? 0);
		const textLayers = Number(meta['whisper.decoder.n_layer'] ?? 0);

		const nAudioLayer = audioLayers;
		const nTextLayer = textLayers;
		const modelSize: TWhisperModelSize = nAudioLayer === 4 ? 'tiny'
			: nAudioLayer === 6 ? 'base'
			: nAudioLayer === 12 ? 'small'
			: nAudioLayer === 24 ? 'medium'
			: nAudioLayer === 32 && nTextLayer === 4 ? 'large-v3-turbo'
			: nAudioLayer === 32 ? 'large'
			: 'unknown';

		return {
			architecture,
			languages,
			vocabSize,
			encoderDim,
			contextLength,
			textContextLength,
			textState,
			audioLayers,
			textLayers,
			modelSize,
			ftype: 'unknown',
			fileSize: fileStat.size,
		};
	} catch (err) {
		console.error(`[whisperModelParser] Failed to parse ${filePath}:`, err);
		return null;
	}
}

const WHISPER_BIN_MAGIC = 0x67676d6c; // "ggml" little-endian

function resolveModelSize(nAudioLayer: number, nTextLayer: number): TWhisperModelSize {
	if (nAudioLayer === 4) return 'tiny';
	if (nAudioLayer === 6) return 'base';
	if (nAudioLayer === 12) return 'small';
	if (nAudioLayer === 24) return 'medium';
	if (nAudioLayer === 32 && nTextLayer === 4) return 'large-v3-turbo';
	if (nAudioLayer === 32) return 'large';
	return 'unknown';
}

function resolveFtype(ftype: number): TWhisperFtype {
	if (ftype === 0) return 'f32';
	if (ftype === 1) return 'f16';
	return 'unknown';
}

// Parse whisper model metadata from .bin file (ggml binary format)
// Header: 4 bytes magic + 44 bytes (11 × int32 LE hparams) = 48 bytes total
export async function parseWhisperBinMetadata(filePath: string): Promise<IWhisperModelMetadata | null> {
	try {
		const fileStat = await fs.stat(filePath);
		const buf = (await fs.readFile(filePath)).slice(0, 48);

		if (buf.length < 48) {
			console.error(`[whisperModelParser] .bin file too small for header: ${filePath}`);
			return null;
		}

		const magic = buf.readUInt32LE(0);
		if (magic !== WHISPER_BIN_MAGIC) {
			console.error(`[whisperModelParser] Invalid magic 0x${magic.toString(16)} in ${filePath}`);
			return null;
		}

		const nVocab = buf.readInt32LE(4);
		const nAudioCtx = buf.readInt32LE(8);
		const nAudioState = buf.readInt32LE(12);
		const nAudioHead = buf.readInt32LE(16);
		const nAudioLayer = buf.readInt32LE(20);
		const nTextCtx = buf.readInt32LE(24);
		const nTextState = buf.readInt32LE(28);
		const nTextHead = buf.readInt32LE(32);
		const nTextLayer = buf.readInt32LE(36);
		const nMels = buf.readInt32LE(40);
		const ftype = buf.readInt32LE(44);

		const modelSize = resolveModelSize(nAudioLayer, nTextLayer);
		const ftypeStr = resolveFtype(ftype);

		console.log(`[whisperModelParser] ${filePath}: ${modelSize} (${nAudioLayer}/${nTextLayer}) ${ftypeStr} vocab=${nVocab}`);

		return {
			architecture: 'whisper',
			languages: [],
			vocabSize: nVocab,
			encoderDim: nAudioState,
			contextLength: nAudioCtx,
			textContextLength: nTextCtx,
			textState: nTextState,
			audioLayers: nAudioLayer,
			textLayers: nTextLayer,
			modelSize,
			ftype: ftypeStr,
			fileSize: fileStat.size,
		};
	} catch (err) {
		console.error(`[whisperModelParser] Failed to parse .bin ${filePath}:`, err);
		return null;
	}
}

// Build a whisper model file entry
export async function buildWhisperModelFile(dirPath: string, fileName: string): Promise<IWhisperModelFile | null> {
	const filePath = path.join(dirPath, fileName);
	const stat = await fs.stat(filePath);
	const sizeMb = Math.round(stat.size / (1024 * 1024));

	const format = fileName.endsWith('.gguf') ? 'gguf' : 'bin';
	const metadata = format === 'gguf'
		? await parseWhisperMetadata(filePath)
		: await parseWhisperBinMetadata(filePath);

	return {
		fileName,
		filePath,
		sizeMb,
		format,
		metadata,
	};
}
