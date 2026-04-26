import { parseGgufMetadata } from '../packages/server/src/services/ggufParser';

async function main() {
	const result = await parseGgufMetadata('path-to-model-gguf');
	console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error);
