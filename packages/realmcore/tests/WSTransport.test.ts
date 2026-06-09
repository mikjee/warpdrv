import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, Server as HTTPServer } from 'node:http';
import { Server as IOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { EventNode, RemoteNode, WSTransport } from '../src/index';
import type { IEventApi } from '../src/events/EventNode';

const ANY = '/**';

let httpServer: HTTPServer;
let io: IOServer;
let port: number;
let clientSocket: ClientSocket;

function waitForConnect(socket: ClientSocket): Promise<void> {
	return new Promise((resolve, reject) => {
		if (socket.connected) { resolve(); return; }
		socket.on('connect', () => resolve());
		socket.on('connect_error', reject);
	});
}

async function connectPair() {
	const A = new EventNode('A', true);
	const B = new EventNode('B', false);

	const clientConn = new Promise<{ transport: WSTransport; remoteA: RemoteNode }>((resolve) => {
		clientSocket = ioClient(`http://localhost:${port}`, {
			query: { nodeId: 'B' },
			transports: ['websocket'],
		});
		clientSocket.on('connect', () => {
			const transport = new WSTransport(clientSocket);
			const remoteA = new RemoteNode('A', B, transport);
			resolve({ transport, remoteA });
		});
	});

	const serverConn = new Promise<{ transport: WSTransport; remoteB: RemoteNode }>((resolve) => {
		io.on('connection', (socket) => {
			const nodeId = socket.handshake.query.nodeId as string;
			const transport = new WSTransport(socket);
			const remoteB = new RemoteNode(nodeId, A, transport);
			resolve({ transport, remoteB });
		});
	});

	const { remoteA } = await clientConn;
	const { remoteB } = await serverConn;

	await A.addChild(remoteB);

	expect(A.nodeAddr).toBe('/A');
	expect(B.nodeAddr).toBe('/A/B');

	return { A, B, remoteA, remoteB };
}

beforeAll(async () => {
	httpServer = createServer();
	io = new IOServer(httpServer, { cors: { origin: '*' } });
	await new Promise<void>((resolve) => {
		port = httpServer.listen(0).address() as number;
		httpServer.on('listening', () => resolve());
	});
});

afterAll(async () => {
	clientSocket?.disconnect();
	await io?.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

// ============================================================
// WSTransport - real Socket.IO tests
// ============================================================

describe('WSTransport - server to client', () => {
	it('pub A → B with expectResponse', async () => {
		const { A, B } = await connectPair();
		B.fn('ask', (api: IEventApi) => (api.payload as number) * 2);
		const result = await A.pub('/A/B', 'ask', 21, { expectResponse: true });
		expect(result).toBe(42);
	});

	it('invoke across socket', async () => {
		const { A, B } = await connectPair();
		B.fn('greet', (api: IEventApi) => `hello ${api.payload}`);
		const result = await A.invoke('B', 'greet', 'world');
		expect(result).toBe('hello world');
	});

	it('pipe with seed across socket', async () => {
		const { A, B } = await connectPair();
		B.listen('test', ANY, (api: IEventApi) => (api.result as number) * 3);
		const result = await A.pipe('test', null, 'B', 10);
		expect(result).toBe(30);
	});

	it('broadcast across socket', async () => {
		const { A, B } = await connectPair();
		let called = false;
		B.listen('test', ANY, () => { called = true; });
		await A.broadcast('test', { data: true }, 'B');
		expect(called).toBe(true);
	});

	it('survey across socket', async () => {
		const { A, B } = await connectPair();
		B.listen('test', ANY, () => 'from-B');
		const result = await A.survey('test', null, 'B');
		expect(result).toEqual(['from-B']);
	});
});

describe('WSTransport - client to server', () => {
	it('pub B → A', async () => {
		const { A, B } = await connectPair();
		let received: unknown = null;
		A.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await B.pub('/A', 'test', { from: 'B' });
		expect(received).toEqual({ from: 'B' });
	});

	it('pub B → A with expectResponse', async () => {
		const { A, B } = await connectPair();
		A.listen('test', ANY, (api: IEventApi) => (api.payload as number) + 100);
		const result = await B.pub('/A', 'test', 50, { expectResponse: true });
		expect(result).toBe(150);
	});

	it('invoke B → A', async () => {
		const { A, B } = await connectPair();
		A.fn('echo', (api: IEventApi) => `echo: ${api.payload}`);
		const result = await B.invoke('/A', 'echo', 'ping');
		expect(result).toBe('echo: ping');
	});
});

describe('WSTransport - sub across socket', () => {
	it('sub A → B receives B pub', async () => {
		const { A, B } = await connectPair();
		let received: unknown = null;
		await A.sub('B', 'test', (api: IEventApi) => { received = api.payload; });
		await B.pub('.', 'test', { from: 'B' });
		expect(received).toEqual({ from: 'B' });
	});

	it('sub B → A receives A pub', async () => {
		const { A, B } = await connectPair();
		let received: unknown = null;
		await B.sub('/A', 'test', (api: IEventApi) => { received = api.payload; });
		await A.pub('.', 'test', { from: 'A' });
		expect(received).toEqual({ from: 'A' });
	});

	it('unsub across socket stops relay', async () => {
		const { A, B } = await connectPair();
		let count = 0;
		const id = await A.sub('B', 'test', (api: IEventApi) => { count++; });
		await B.pub('.', 'test', { first: true });
		expect(count).toBe(1);
		await A.unsub('B', id);
		await B.pub('.', 'test', { second: true });
		expect(count).toBe(1);
	});
});

describe('WSTransport - JSON serialization boundary', () => {
	it('payload survives JSON round-trip', async () => {
		const { A, B } = await connectPair();
		B.fn('echo', (api: IEventApi) => api.payload);
		const payload = { a: 1, b: null, c: [1, 2], d: { nested: true } };
		const result = await A.invoke('B', 'echo', payload);
		expect(result).toEqual(payload);
	});

	it('undefined becomes null over wire', async () => {
		const { A, B } = await connectPair();
		B.fn('echo', (api: IEventApi) => api.payload);
		const payload = { a: undefined, b: 'present' };
		const result = await A.invoke('B', 'echo', payload);
		expect(result).toEqual({ b: 'present' });
		expect((result as any).a).toBeUndefined();
	});

	it('seed/result threading survives serialization', async () => {
		const { A, B } = await connectPair();
		B.listen('test', ANY, (api: IEventApi) => {
			const r = api.result as number;
			return r * 2;
		});
		const result = await A.pipe('test', null, 'B', 21);
		expect(result).toBe(42);
	});

	it('complex payload round-trip', async () => {
		const { A, B } = await connectPair();
		B.fn('transform', (api: IEventApi) => {
			const p = api.payload as { items: Array<number> };
			return p.items.reduce((sum: number, n: number) => sum + n, 0);
		});
		const result = await A.invoke('B', 'transform', { items: [1, 2, 3, 4] });
		expect(result).toBe(10);
	});
});

describe('WSTransport - lifecycle', () => {
	it('removeChild detaches remote', async () => {
		const { A, B } = await connectPair();
		await A.removeChild('B');
		expect(B.parent).toBeNull();
		expect(B.nodeAddr).toBe('');
	});

	it('multiple clients connect independently', async () => {
		const A = new EventNode('A', true);
		const B = new EventNode('B', false);
		const C = new EventNode('C', false);

		const clientB = ioClient(`http://localhost:${port}`, {
			query: { nodeId: 'B' },
			transports: ['websocket'],
		});
		await waitForConnect(clientB);
		const transportB = new WSTransport(clientB);
		const remoteB = new RemoteNode('B', A, transportB);
		new RemoteNode('A', B, transportB);
		await A.addChild(remoteB);

		const clientC = ioClient(`http://localhost:${port}`, {
			query: { nodeId: 'C' },
			transports: ['websocket'],
		});
		await waitForConnect(clientC);
		const transportC = new WSTransport(clientC);
		const remoteC = new RemoteNode('C', A, transportC);
		new RemoteNode('A', C, transportC);
		await A.addChild(remoteC);

		B.fn('ask', (api: IEventApi) => (api.payload as number) * 2);
		C.fn('ask', (api: IEventApi) => (api.payload as number) * 3);

		expect(await A.invoke('B', 'ask', 10)).toBe(20);
		expect(await A.invoke('C', 'ask', 10)).toBe(30);

		clientB.disconnect();
		clientC.disconnect();
	});
});
