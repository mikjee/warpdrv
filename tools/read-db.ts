import { store } from '../packages/server/src/util/store.js';
import { scanAllModelRoots } from '../packages/server/src/services/modelScanner.js';

async function main() {
	const settings = await store.get('settings:general');
	console.log('Settings:', JSON.stringify(settings, null, 2));

	// List all keys
	const allKeys = await store.keys('');
	console.log('\nAll keys in DB:', allKeys);

	// Test scan
	if (settings?.modelRoots && settings.modelRoots.length > 0) {
		console.log('\n--- Testing model scan ---');
		const models = await scanAllModelRoots(settings.modelRoots);
		console.log(`\nScan complete. Found ${models.length} models.`);
		for (const m of models.slice(0, 10)) {
			console.log(`  - ${m.user}/${m.name}: ${m.files.length} files`);
		}
	}
}

main().catch(console.error);
