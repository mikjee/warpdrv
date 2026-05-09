import fs from 'fs/promises';
import path from 'path';
import type { IWhisperModelMetadata, IWhisperModelFile } from '@warpcore/shared';

// Parse whisper model metadata from GGUF header
export async function parseWhisperMetadata(filePath: string): Promise<IWhisperModelMetadata | null> {
	try {
		const { gguf } = await import('@huggingface/gguf');
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

		return {
			architecture,
			languages,
			vocabSize,
			encoderDim,
			contextLength,
			fileSize: fileStat.size,
		};
	} catch (err) {
		console.error(`[whisperModelParser] Failed to parse ${filePath}:`, err);
		return null;
	}
}

// Parse whisper model metadata from .bin file (basic header read)
export async function parseWhisperBinMetadata(filePath: string): Promise<IWhisperModelMetadata | null> {
	try {
		const fileStat = await fs.stat(filePath);

		// .bin files don't have easily parseable headers without whisper.cpp code
		// Return basic info from file size
		return {
			architecture: 'whisper',
			languages: [],
			vocabSize: 0,
			encoderDim: 0,
			contextLength: 0,
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
