import express from 'express';
import type { Server } from 'http';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { authorizeAccess, authorizeToolCall } from './auth';
import type { IStartArgs, IStartResult, IWarpmcpDeps } from './types';
import { fileReadDefinition, fileReadHandler } from './tools/file_read';
import { fileWriteDefinition, fileWriteHandler } from './tools/file_write';
import { dirListDefinition, dirListHandler } from './tools/dir_list';
import { shellExecDefinition, shellExecHandler } from './tools/shell_exec';
import { fetchDefinition, fetchHandler } from './tools/fetch';
import { embeddingSearchDefinition, embeddingSearchHandler } from './tools/embedding_search';
// import { webSearchDefinition, webSearchHandler } from './tools/web_search';
// import { webSearchNewsDefinition, webSearchNewsHandler } from './tools/web_search_news';
// import { webSearchImagesDefinition, webSearchImagesHandler } from './tools/web_search_images';
// import { webSearchVideosDefinition, webSearchVideosHandler } from './tools/web_search_videos';
import { todoReadDefinition, todoReadHandler } from './tools/todo';
import { todoAddDefinition, todoAddHandler } from './tools/todo';
import { todoRemoveDefinition, todoRemoveHandler } from './tools/todo';
import { todoUpdateDefinition, todoUpdateHandler } from './tools/todo';
import { todoClearDefinition, todoClearHandler } from './tools/todo';
import { todoWriteDefinition, todoWriteHandler } from './tools/todo';
const SERVER_NAME = 'warpmcp';
let httpServer: Server | null = null;
let currentPort: number | null = null;
let currentBindHost: string | null = null;
function buildMcpServer(deps: IWarpmcpDeps): McpServer {
	const tools = [
		{ def: fileReadDefinition, handler: (a: any) => fileReadHandler(deps, a) },
		{ def: fileWriteDefinition, handler: (a: any) => fileWriteHandler(deps, a) },
		{ def: dirListDefinition, handler: (a: any) => dirListHandler(deps, a) },
		{ def: shellExecDefinition, handler: (a: any) => shellExecHandler(a) },
		{ def: fetchDefinition, handler: (a: any) => fetchHandler(a) },
		// { def: webSearchDefinition, handler: (a: any) => webSearchHandler(a) },
		// { def: webSearchNewsDefinition, handler: (a: any) => webSearchNewsHandler(a) },
		// { def: webSearchImagesDefinition, handler: (a: any) => webSearchImagesHandler(a) },
		// { def: webSearchVideosDefinition, handler: (a: any) => webSearchVideosHandler(a) },
		{ def: embeddingSearchDefinition, handler: (a: any) => embeddingSearchHandler(deps, a) },
		// { def: todoReadDefinition, handler: (a: any) => todoReadHandler(deps, a) },
		// { def: todoAddDefinition, handler: (a: any) => todoAddHandler(deps, a) },
		// { def: todoRemoveDefinition, handler: (a: any) => todoRemoveHandler(deps, a) },
		// { def: todoUpdateDefinition, handler: (a: any) => todoUpdateHandler(deps, a) },
		// { def: todoClearDefinition, handler: (a: any) => todoClearHandler(deps, a) },
		{ def: todoWriteDefinition, handler: (a: any) => todoWriteHandler(deps, a) },
	];
	const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' }, { capabilities: { tools: {} } });
	server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(t => t.def) }));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params;
		const tool = tools.find(t => t.def.name === name);
		if (!tool) throw new Error(`Unknown tool: ${name}`);
		const result = await tool.handler(args as any);
		//console.log('[warpmcp] Tool', name, 'result:', JSON.stringify(result).slice(0, 200));
		return { content: [{ type: 'text', text: JSON.stringify(result) }] };
	});
	return server;
}
export async function startServer(args: IStartArgs): Promise<IStartResult> {
	const { port, exposeExternal } = args;
	const deps: IWarpmcpDeps = { isRemote: args.isRemote, validateBearerToken: args.validateBearerToken, getFsAllowedRoots: args.getFsAllowedRoots, embeddingSearch: args.embeddingSearch, todoRead: args.todoRead, todoAdd: args.todoAdd, todoRemove: args.todoRemove, todoUpdate: args.todoUpdate, todoClear: args.todoClear, todoWrite: args.todoWrite };
	//console.log('[warpmcp] startServer deps.embeddingSearch:', typeof args.embeddingSearch);
	const bindHost = exposeExternal ? '0.0.0.0' : '127.0.0.1';
	const app = express();
	app.use(express.json());
	const transports: Record<string, StreamableHTTPServerTransport> = {};
	app.all('/mcp', async (req, res) => {
		const isToolCall = req.method === 'POST' && req.body?.method === 'tools/call';
		const toolName = req.body?.params?.name;
		if (isToolCall && typeof toolName === 'string') {
			const authz = await authorizeToolCall(deps, req, toolName);
			if (!authz.ok) { res.status(401).json({ error: authz.reason }); return; }
		} else {
			const authz = await authorizeAccess(deps, req);
			if (!authz.ok) { res.status(401).json({ error: authz.reason }); return; }
		}
		const sessionId = req.headers['mcp-session-id'] as string | undefined;
		let transport = sessionId ? transports[sessionId] : undefined;
		if (!transport) {
			transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: () => randomUUID(),
				onsessioninitialized: (sid) => { transports[sid] = transport!; },
			});
			const server = buildMcpServer(deps);
			await server.connect(transport);
			transport.onclose = () => { if (transport!.sessionId) delete transports[transport!.sessionId]; };
		}
		await transport.handleRequest(req, res, req.body);
	});
	return await new Promise((resolve, reject) => {
		const srv = app.listen(port, bindHost, () => {
			httpServer = srv;
			currentPort = port;
			currentBindHost = bindHost;
			console.log(`[warpmcp] Built-in MCP server listening on ${bindHost}:${port}`);
			resolve({ port, bindHost });
		});
		srv.on('error', reject);
	});
}
export async function stopServer(): Promise<void> {
	if (!httpServer) return;
	await new Promise<void>((resolve) => {
		httpServer!.close(() => resolve());
	});
	httpServer = null;
	currentPort = null;
	currentBindHost = null;
}
export async function restartServer(args: IStartArgs): Promise<IStartResult> {
	await stopServer();
	return await startServer(args);
}
export function getStatus(): { running: boolean; port: number | null; bindHost: string | null } {
	return { running: httpServer !== null, port: currentPort, bindHost: currentBindHost };
}
export const SERVER_NAME_CONST = SERVER_NAME;
export type { IStartArgs, IStartResult, IWarpmcpDeps, IEmbeddingSearchResult } from './types';
