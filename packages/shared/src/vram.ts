import type { IVramEstimateInput, IVramEstimate } from './types';

// Safety buffer in MB for 95% confidence that model loads
const SAFETY_BUFFER_MB = 577;

// oobabooga's regression formula for VRAM prediction
// Source: https://oobabooga.github.io/blog/posts/gguf-vram-formula/
// Trained on 19,517 measurements across 60 quants / 32 model families
export function estimateVram(input: IVramEstimateInput): number {
	const effectiveGpuLayers = Math.min(input.gpuLayers, input.nLayers);
	const sizePerLayer = input.sizeInMb / input.nLayers;	const kvCacheFactor = input.nKvHeads * input.cacheType * input.contextLength;
	const embeddingPerContext = input.embeddingDim / input.contextLength;

	const vram =
		(sizePerLayer - 17.99552795246051 + 3.148552680382576e-05 * kvCacheFactor)
		* (effectiveGpuLayers + Math.max(0.9690636483914102, input.cacheType - (Math.floor(50.77817218646521 * embeddingPerContext) + 9.987899908205632)))
		+ 1516.522943869404;

	return Math.max(0, Math.round(vram));
}

// Full estimate with safety buffer and fit check
export function calculateVramEstimate(
	input: IVramEstimateInput,
	availableMb: number,
): IVramEstimate {
	const estimatedMb = estimateVram(input);
	const safeEstimateMb = estimatedMb + SAFETY_BUFFER_MB;

	return {
		estimatedMb,
		safeEstimateMb,
		willFit: safeEstimateMb <= availableMb,
		availableMb,
	};
}

// Convert EKvQuantType string to the numeric cache_type value
// used in the formula (16 for f16, 8 for q8_0, 4 for q4_0/q4_1)
export function kvQuantToNumeric(kvQuant: string): number {
	switch (kvQuant) {
		case 'f16': return 16;
		case 'q8_0': return 8;
		case 'q4_0':
		case 'q4_1':
		case 'iq4_nl': return 4;
		case 'q5_0':
		case 'q5_1': return 5;
		default: return 16;
	}
}
