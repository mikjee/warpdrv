import { gguf } from '@huggingface/gguf';
import type { IGgufMetadata } from '@warpcore/shared';
import { stat } from 'fs/promises';

// Parse GGUF file header and return metadata using @huggingface/gguf
export async function parseGgufMetadata(filePath: string): Promise<IGgufMetadata | null> {
	try {
		const ggufData = await gguf(filePath, { allowLocalFile: true });
		const meta = ggufData.metadata as Record<string, unknown>;

		// Get architecture
		const architecture = String(meta['general.architecture'] ?? 'unknown');

		// Get metadata values
		const nLayers = Number(meta[`${architecture}.block_count`] ?? meta['general.block_count'] ?? 0);
		const nKvHeads = Number(meta[`${architecture}.attention.head_count_kv`] ?? 0);
		const embeddingDim = Number(meta[`${architecture}.embedding_length`] ?? 0);
		const feedForwardDim = Number(meta[`${architecture}.feed_forward_length`] ?? 0);
		const contextLength = Number(meta[`${architecture}.context_length`] ?? 0);
		const generalName = String(meta['general.name'] ?? '');

		// Get file size
		const fileStat = await stat(filePath);

		// Infer quant type from filename (more reliable than file_type enum)
		const quantMatch = filePath.match(/[-_](Q\d[\w_]*|IQ\d[\w_]*|MXFP\d+|NVFP\d+|F16|F32|BF16)/i);
		const quantType = quantMatch ? quantMatch[1]!.toUpperCase() : 'unknown';

		// Infer param count from general.name
		const paramCount = extractParamCount(generalName);

		return {
			architecture,
			paramCount,
			quantType,
			nLayers,
			nKvHeads,
			embeddingDim,
			feedForwardDim,
			contextLength,
			fileSize: fileStat.size,
			vocabSize: Number(meta['tokenizer.vocab_size'] ?? 0),
		};
	} catch (error) {
		console.error(`Failed to parse GGUF metadata for ${filePath}:`, error);
		return null;
	}
}

// Extract parameter count from model name like "Llama-3.2-1B-Instruct" or "Orchestrator 8B"
function extractParamCount(name: string): string {
	// Try separator pattern first (Llama-3.2-1B), then space pattern (Orchestrator 8B)
	const match = name.match(/[-_. ](\d+\.?\d*)[bB]/i);
	return match ? `${match[1]}B` : 'unknown';
}
