import { store } from '../util/store';

const SCHEMA_KEY = '_schemaVersion';
const CURRENT_SCHEMA = 2;

// Each migration transforms data from version N to N+1
// Add new migrations as the data shape evolves
type TMigrationFn = () => Promise<void>;

const migrations: Record<number, TMigrationFn> = {
	// Example: migration from schema 0 (no version) to 1
	// Adds schema version marker, ensures settings have modelRoots array
	1: async () => {
		const settings = await store.get<Record<string, unknown>>('settings:general');
		if (settings) {
			// Ensure modelRoots exists (renamed from modelDirs in early versions)
			if (!settings.modelRoots && settings.modelDirs) {
				settings.modelRoots = settings.modelDirs;
				delete settings.modelDirs;
				await store.put('settings:general', settings);
			}
		}
	},

	// Migration v2: rename modelAlias to serverName for existing servers
	2: async () => {
		const servers = await store.list<Record<string, unknown>>('servers:');
		for (const server of servers) {
			if (server.modelAlias) {
				server.serverName = server.modelAlias;
				delete server.modelAlias;
				await store.put('servers:' + server.id, server);
			}
		}
	},

	// Future migrations go here:
	// 3: async () => { ... },
};

export async function runMigrations(): Promise<void> {
	const currentVersion = await store.get<number>(SCHEMA_KEY) ?? 0;

	if (currentVersion >= CURRENT_SCHEMA) return;

	console.log(`[WarpCore] Running migrations from schema v${currentVersion} to v${CURRENT_SCHEMA}`);

	for (let v = currentVersion + 1; v <= CURRENT_SCHEMA; v++) {
		const migrate = migrations[v];
		if (migrate) {
			console.log(`[WarpCore] Migration v${v - 1} -> v${v}`);
			try {
				await migrate();
			} catch (err) {
				console.error(`[WarpCore] Migration v${v} failed:`, err);
				throw err;
			}
		}
	}

	await store.put(SCHEMA_KEY, CURRENT_SCHEMA);
	console.log(`[WarpCore] Migrations complete, schema at v${CURRENT_SCHEMA}`);
}
