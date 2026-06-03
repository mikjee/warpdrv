import { startServer as startWarpmcp, stopServer as stopWarpmcp, SERVER_NAME_CONST as WARPMCP_NAME } from '@warpcore/warpmcp';
import { isRemote } from './middleware/auth';
import { validateBearerToken } from './routes/tokens';
import { store } from './util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { mcpClient } from './index';
import { embeddingManager } from './services/embeddingManager';
const SETTINGS_KEY = 'settings:general';
async function getSettings(): Promise<ISettings> {
	return (await store.get<ISettings>(SETTINGS_KEY)) ?? DEFAULT_SETTINGS;
}
let currentSettings: ISettings = DEFAULT_SETTINGS;
export function updateCurrentSettings(s: ISettings): void {
	currentSettings = s;
}
export async function bootWarpmcp(): Promise<void> {
	const settings = await getSettings();
	currentSettings = settings;
	const { port } = await startWarpmcp({
		port: settings.builtinMcpPort ?? 11437,
		exposeExternal: settings.builtinMcpExposeExternal ?? false,
		isRemote,
		validateBearerToken,
		getFsAllowedRoots: () => (currentSettings.fsAllowedRoots ?? []),
		embeddingSearch: (query: string, topK: number) => embeddingManager.search(query, topK),
	});
	await mcpClient.connect(WARPMCP_NAME, { url: `http://127.0.0.1:${port}/mcp` });
}
export async function restartWarpmcpIfChanged(prev: ISettings, next: ISettings): Promise<void> {
	const portChanged = (prev.builtinMcpPort ?? 11437) !== (next.builtinMcpPort ?? 11437);
	const exposeChanged = (prev.builtinMcpExposeExternal ?? false) !== (next.builtinMcpExposeExternal ?? false);
	if (!portChanged && !exposeChanged) return;
	await mcpClient.disconnect(WARPMCP_NAME);
	await stopWarpmcp();
	const { port } = await startWarpmcp({
		port: next.builtinMcpPort ?? 11437,
		exposeExternal: next.builtinMcpExposeExternal ?? false,
		isRemote,
		validateBearerToken,
		getFsAllowedRoots: () => (currentSettings.fsAllowedRoots ?? []),
		embeddingSearch: (query: string, topK: number) => embeddingManager.search(query, topK),
	});
	await mcpClient.connect(WARPMCP_NAME, { url: `http://127.0.0.1:${port}/mcp` });
}
