import { parseGgufMetadata } from '../packages/server/src/services/ggufParser';

async function main() {
	const result = await parseGgufMetadata('/mnt/ml/Models/lm-studio-models/DJLougen/MiroThinker-1.7-mini-GGUF-Q6_K/MiroThinker-1.7-mini-Q6_K.gguf');
	console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
