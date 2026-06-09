import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HTTPServer } from 'node:http';
import { Server as IOServer, Socket as ServerSocket } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { EventNode, RemoteNode, WSTransport } from '../src/index';
import type { IEventApi } from '../src/events/EventNode';

const ANY = '/**';
const TEST_TIMEOUT = 5000;

let httpServer: HTTPServer;
let io: IOServer;
let port: number;

function waitForConnect(socket: ClientSocket, timeout: number = TEST_TIMEOUT): Promise<void> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('connection timeout')), timeout);
		if (socket.connected) { clearTimeout(timer); resolve(); return; }
		socket.on('connect', () => { clearTimeout(timer); resolve(); });
		socket.on('connect_error', (err) => { clearTimeout(timer); reject(err); });
	});
}

async function connectPair() {
	const serverA = new EventNode('A', true);
	const clientB = new EventNode('B', false);
	const serverConnDone = new Promise<RemoteNode>((resolve) => {
		const handler = (socket: ServerSocket) => {
			const nodeId = socket.handshake.query.nodeId as string;
			const transport = new WSTransport(socket);
			const remote = new RemoteNode(nodeId, serverA, transport);
			resolve(remote);
			io.off('connection', handler);
		};
		io.on('connection', handler);
	});

	const clientSocket = ioClient(`http://localhost:${port}`, {
		query: { nodeId: 'B' },
		transports: ['websocket'],
	});
	await waitForConnect(clientSocket);
	const clientTransport = new WSTransport(clientSocket);
	const clientRemoteA = new RemoteNode('A', clientB, clientTransport);

	const serverRemoteB = await Promise.race([
		serverConnDone,
		new Promise<RemoteNode>((_, r) => setTimeout(() => r(null as any), TEST_TIMEOUT)),
	]);

	await serverA.addChild(serverRemoteB);
	expect(serverA.nodeAddr).toBe('/A');
	expect(clientB.nodeAddr).toBe('/A/B');

	return { A: serverA, B: clientB, remoteA: clientRemoteA, remoteB: serverRemoteB, clientSocket };
}

beforeAll(async () => {
	httpServer = createServer();
	io = new IOServer(httpServer, { cors: { origin: '*' } });
	io.setMaxListeners(20);
	port = await new Promise<number>((resolve, reject) => {
		const srv = httpServer.listen(0, () => {
			const addr = httpServer.address();
			resolve(typeof addr === 'object' && addr ? addr.port : 0);
		});
		srv.on('error', reject);
	});
}, TEST_TIMEOUT);

afterAll(async () => {
	await io?.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ============================================================
// WSTransport - real Socket.IO tests
// ============================================================

describe('WSTransport - server to client', () => {
	it('pub A → B with expectResponse', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.fn('ask', (api: IEventApi) => (api.payload as number) * 2);
		const result = await A.pub('/A/B', 'ask', 21, { expectResponse: true });
		expect(result).toBe(42);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('invoke across socket', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.fn('greet', (api: IEventApi) => `hello ${api.payload}`);
		const result = await A.invoke('B', 'greet', 'world');
		expect(result).toBe('hello world');
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('pipe with seed across socket', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.listen('test', ANY, (api: IEventApi) => (api.result as number) * 3);
		const result = await A.pipe('test', null, 'B', 10);
		expect(result).toBe(30);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('broadcast across socket', async () => {
		const { A, B, clientSocket } = await connectPair();
		let called = false;
		B.listen('test', ANY, () => { called = true; });
		await A.broadcast('test', { data: true }, 'B');
		expect(called).toBe(true);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('survey across socket', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.listen('test', ANY, () => 'from-B');
		const result = await A.survey('test', null, 'B');
		expect(result).toEqual(['from-B']);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);
});

describe('WSTransport - client to server', () => {
	it('pub B → A', async () => {
		const { A, B, clientSocket } = await connectPair();
		let received: unknown = null;
		A.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await B.pub('/A', 'test', { from: 'B' });
		expect(received).toEqual({ from: 'B' });
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('pub B → A with expectResponse', async () => {
		const { A, B, clientSocket } = await connectPair();
		A.listen('test', ANY, (api: IEventApi) => (api.payload as number) + 100);
		const result = await B.pub('/A', 'test', 50, { expectResponse: true });
		expect(result).toBe(150);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('invoke B → A', async () => {
		const { A, B, clientSocket } = await connectPair();
		A.fn('echo', (api: IEventApi) => `echo: ${api.payload}`);
		const result = await B.invoke('/A', 'echo', 'ping');
		expect(result).toBe('echo: ping');
		clientSocket.disconnect();
	}, TEST_TIMEOUT);
});

describe('WSTransport - sub across socket', () => {
	it('sub A → B receives B pub', async () => {
		const { A, B, clientSocket } = await connectPair();
		let received: unknown = null;
		await A.sub('B', 'test', (api: IEventApi) => { received = api.payload; });
		await B.pub('.', 'test', { from: 'B' });
		await new Promise(r => setTimeout(r, 50));  // relay route crosses socket async
		expect(received).toEqual({ from: 'B' });
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('sub B → A receives A pub', async () => {
		const { A, B, clientSocket } = await connectPair();
		let received: unknown = null;
		await B.sub('/A', 'test', (api: IEventApi) => { received = api.payload; });
		await A.pub('.', 'test', { from: 'A' });
		await new Promise(r => setTimeout(r, 50));
		expect(received).toEqual({ from: 'A' });
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('unsub across socket stops relay', async () => {
		const { A, B, clientSocket } = await connectPair();
		let count = 0;
		const id = await A.sub('B', 'test', (api: IEventApi) => { count++; });
		await B.pub('.', 'test', { first: true });
		await new Promise(r => setTimeout(r, 50));
		expect(count).toBe(1);
		await A.unsub('B', id);
		await B.pub('.', 'test', { second: true });
		await new Promise(r => setTimeout(r, 50));
		expect(count).toBe(1);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);
});

describe('WSTransport - JSON serialization boundary', () => {
	it('payload survives JSON round-trip', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.fn('echo', (api: IEventApi) => api.payload);
		const payload = { a: 1, b: null, c: [1, 2], d: { nested: true } };
		const result = await A.invoke('B', 'echo', payload);
		expect(result).toEqual(payload);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('undefined is stripped over wire', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.fn('echo', (api: IEventApi) => api.payload);
		const payload = { a: undefined, b: 'present' };
		const result = await A.invoke('B', 'echo', payload);
		expect(result).toEqual({ b: 'present' });
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('seed/result threading survives serialization', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.listen('test', ANY, (api: IEventApi) => {
			const r = api.result as number;
			return r * 2;
		});
		const result = await A.pipe('test', null, 'B', 21);
		expect(result).toBe(42);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);

	it('complex payload round-trip', async () => {
		const { A, B, clientSocket } = await connectPair();
		B.fn('transform', (api: IEventApi) => {
			const p = api.payload as { items: Array<number> };
			return p.items.reduce((sum: number, n: number) => sum + n, 0);
		});
		const result = await A.invoke('B', 'transform', { items: [1, 2, 3, 4] });
		expect(result).toBe(10);
		clientSocket.disconnect();
	}, TEST_TIMEOUT);
});

describe('WSTransport - lifecycle', () => {
	it('removeChild detaches remote', async () => {
		const { A, B, clientSocket } = await connectPair();
		await A.removeChild('B');
		expect(B.parent).toBeNull();
		expect(B.nodeAddr).toBe('');
		clientSocket.disconnect();
	}, TEST_TIMEOUT);
});
