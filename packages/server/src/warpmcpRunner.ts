import { startServer as startWarpmcp, stopServer as stopWarpmcp, SERVER_NAME_CONST as WARPMCP_NAME } from '@warpcore/warpmcp';
import { isRemote } from './middleware/auth';
import { validateBearerToken } from './routes/tokens';
import { store } from './util/store';
import type { ISettings } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import { mcpClient, todoManager, getProjectRoot, codeGraphService } from './index';
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
		embeddingSearch: (query: string, topK: number, topic: string) => embeddingManager.search(query, topK, topic),
		getProjectRoot: (tid) => getProjectRoot(tid),
		// todoRead: (tid) => todoManager.read(tid),
		// todoAdd: (tid, todo, index) => todoManager.add(tid, todo, index),
		// todoRemove: (tid, index) => todoManager.remove(tid, index),
		// todoUpdate: (tid, index, status) => todoManager.update(tid, index, status),
		// todoClear: (tid) => todoManager.clear(tid),
		todoWrite: (tid, todos, etag) => todoManager.write(tid, todos, etag),
		onFileWritten: (filePath) => codeGraphService.onFileWritten(filePath),
		codeGraphIngest: (projectRoot, force) => codeGraphService.ingest(projectRoot, force),
		codeGraphSearch: (projectRoot, query, options) => codeGraphService.search(projectRoot, query, options),
		codeGraphGetSymbol: (projectRoot, symbolId) => codeGraphService.getSymbol(projectRoot, symbolId),
		codeGraphGetCallers: (projectRoot, symbolId, depth) => codeGraphService.getCallers(projectRoot, symbolId, depth),
		codeGraphGetCallees: (projectRoot, symbolId, depth) => codeGraphService.getCallees(projectRoot, symbolId, depth),
		codeGraphListFile: (projectRoot, filePath) => codeGraphService.listFile(projectRoot, filePath),
		codeGraphClear: (projectRoot) => codeGraphService.clear(projectRoot),
	});
	await mcpClient.connect(WARPMCP_NAME, {
		url: `http://127.0.0.1:${port}/mcp`,
		warpdrv: { argDefaults: {
			"embedding_search": { "topic": "{{ws.topic}}" },
			// "todo_read": { "threadId": "{{ws.threadId}}" },
			// "todo_add": { "threadId": "{{ws.threadId}}" },
			// "todo_remove": { "threadId": "{{ws.threadId}}" },
			// "todo_update": { "threadId": "{{ws.threadId}}" },
			// "todo_clear": { "threadId": "{{ws.threadId}}" },
			"todo_write": { "threadId": "{{ws.threadId}}" },
			"rg": { "path": "{{ts.projectRoot}}" },
			"get_project_root": { "threadId": "{{ws.threadId}}" },
			"code_graph_ingest": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_search": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_symbol": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_callers": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_callees": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_list": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_clear": { "project_root": "{{ts.projectRoot}}" },
		} },
	});
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
		embeddingSearch: (query: string, topK: number, topic: string) => embeddingManager.search(query, topK, topic),
		getProjectRoot: (tid) => getProjectRoot(tid),
		// todoRead: (tid) => todoManager.read(tid),
		// todoAdd: (tid, todo, index) => todoManager.add(tid, todo, index),
		// todoRemove: (tid, index) => todoManager.remove(tid, index),
		// todoUpdate: (tid, index, status) => todoManager.update(tid, index, status),
		// todoClear: (tid) => todoManager.clear(tid),
		todoWrite: (tid, todos, etag) => todoManager.write(tid, todos, etag),
		onFileWritten: (filePath) => codeGraphService.onFileWritten(filePath),
		codeGraphIngest: (projectRoot, force) => codeGraphService.ingest(projectRoot, force),
		codeGraphSearch: (projectRoot, query, options) => codeGraphService.search(projectRoot, query, options),
		codeGraphGetSymbol: (projectRoot, symbolId) => codeGraphService.getSymbol(projectRoot, symbolId),
		codeGraphGetCallers: (projectRoot, symbolId, depth) => codeGraphService.getCallers(projectRoot, symbolId, depth),
		codeGraphGetCallees: (projectRoot, symbolId, depth) => codeGraphService.getCallees(projectRoot, symbolId, depth),
		codeGraphListFile: (projectRoot, filePath) => codeGraphService.listFile(projectRoot, filePath),
		codeGraphClear: (projectRoot) => codeGraphService.clear(projectRoot),
	});
	await mcpClient.connect(WARPMCP_NAME, {
		url: `http://127.0.0.1:${port}/mcp`,
		warpdrv: { argDefaults: {
			"embedding_search": { "topic": "{{ws.topic}}" },
			// "todo_read": { "threadId": "{{ws.threadId}}" },
			// "todo_add": { "threadId": "{{ws.threadId}}" },
			// "todo_remove": { "threadId": "{{ws.threadId}}" },
			// "todo_update": { "threadId": "{{ws.threadId}}" },
			// "todo_clear": { "threadId": "{{ws.threadId}}" },
			"todo_write": { "threadId": "{{ws.threadId}}" },
			"rg": { "path": "{{ts.projectRoot}}" },
			"get_project_root": { "threadId": "{{ws.threadId}}" },
			"code_graph_ingest": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_search": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_symbol": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_callers": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_callees": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_list": { "project_root": "{{ts.projectRoot}}" },
			"code_graph_clear": { "project_root": "{{ts.projectRoot}}" },
		} },
	});
}
