import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventNode, RemoteNode, MockTransport } from '../src/index';
import type { IEventApi } from '../src/events/EventNode';

const ANY = '/**';

async function createRemotePair() {
	const A = new EventNode('A', true);
	const B = new EventNode('B', false);
	const transportA = new MockTransport();
	const transportB = new MockTransport();
	const remoteB = new RemoteNode('B', A, transportA);
	const remoteA = new RemoteNode('A', B, transportB);
	transportA.link(transportB);
	transportB.link(transportA);
	await A.addChild(remoteB);
	return { A, B, remoteA, remoteB };
}

// ============================================================
// RemoteNode + EventNode integration
// ============================================================

describe('RemoteNode - setup', () => {
	it('addr setup after addChild', async () => {
		const { A, B } = await createRemotePair();
		expect(A.nodeAddr).toBe('/A');
		expect(B.nodeAddr).toBe('/A/B');
	});

	it('B has remoteA as parent', async () => {
		const { B, remoteA } = await createRemotePair();
		expect(B.parent).toBe(remoteA);
	});
});

describe('RemoteNode - pub across boundary', () => {
	it('pub A → B fires B listener', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		B.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await A.pub('B', 'test', { from: 'A' });
		expect(received).toEqual({ from: 'A' });
	});

	it('pub B → A fires A listener', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		A.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await B.pub('..', 'test', { from: 'B' });
		expect(received).toEqual({ from: 'B' });
	});

	it('pub A → B with expectResponse returns value', async () => {
		const { A, B } = await createRemotePair();
		B.listen('test', ANY, (api: IEventApi) => api.payload + 100);
		const result = await A.pub('B', 'test', 50, { expectResponse: true });
		expect(result).toBe(150);
	});
});

describe('RemoteNode - sub across boundary', () => {
	it('sub A → B receives B pub', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		await A.sub('B', 'test', (api: IEventApi) => { received = api.payload; });
		await B.pub('.', 'test', { from: 'B' });
		expect(received).toEqual({ from: 'B' });
	});

	it('sub B → A receives A pub', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		await B.sub('..', 'test', (api: IEventApi) => { received = api.payload; });
		await A.pub('.', 'test', { from: 'A' });
		expect(received).toEqual({ from: 'A' });
	});

	it('unsub across stops relay', async () => {
		const { A, B } = await createRemotePair();
		let count = 0;
		const id = await A.sub('B', 'test', (api: IEventApi) => { count++; });
		await B.pub('.', 'test', { first: true });
		expect(count).toBe(1);
		await A.unsub('B', id);
		await B.pub('.', 'test', { second: true });
		expect(count).toBe(1);
	});
});

describe('RemoteNode - wrappers', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('invoke across boundary', async () => {
		const { A, B } = await createRemotePair();
		B.fn('greet', (api: IEventApi) => `hello ${api.payload}`);
		const result = await A.invoke('B', 'greet', 'world');
		expect(result).toBe('hello world');
	});

	it('pipe across boundary', async () => {
		const { A, B } = await createRemotePair();
		B.listen('test', ANY, (api: IEventApi) => (api.result as number) * 3);
		const result = await A.pipe('test', null, 'B', 10);
		expect(result).toBe(30);
	});

	it('survey across boundary', async () => {
		const { A, B } = await createRemotePair();
		B.listen('test', ANY, () => 'from-B');
		const result = await A.survey('test', null, 'B');
		expect(result).toEqual(['from-B']);
	});

	it('broadcast across boundary', async () => {
		const { A, B } = await createRemotePair();
		let called = false;
		B.listen('test', ANY, () => { called = true; });
		await A.broadcast('test', { data: true }, 'B');
		expect(called).toBe(true);
	});

	it('on across boundary', async () => {
		const { A, B } = await createRemotePair();
		let called = false;
		await A.on('B', 'test', (api: IEventApi) => { called = true; });
		await B.pub('.', 'test', { data: true });
		expect(called).toBe(true);
	});

	it('hook across boundary', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		await A.hook('B', 'test', (api: IEventApi) => {
			received = api.payload;
			return 'hooked';
		});
		const result = await B.pub('.', 'test', { data: true }, { expectResponse: true });
		expect(received).toEqual({ data: true });
		expect(result).toBe('hooked');
	});
});

describe('RemoteNode - edge cases', () => {
	it('removeChild detaches remote', async () => {
		const { A, B } = await createRemotePair();
		await A.removeChild('B');
		expect(B.parent).toBeNull();
		expect(B.nodeAddr).toBe('');
	});

	it('transport not linked throws', async () => {
		const A = new EventNode('A', true);
		const B = new EventNode('B', false);
		const transportA = new MockTransport();
		const transportB = new MockTransport();
		const remoteB = new RemoteNode('B', A, transportA);
		const remoteA = new RemoteNode('A', B, transportB);
		// link only one direction
		transportA.link(transportB);
		await A.addChild(remoteB);
		// A → B works, B → A fails
		B.listen('test', ANY, () => 'ok');
		await expect(B.pub('..', 'test')).rejects.toThrow('not linked');
	});

	it('round-trip pub A→B→A via sub relay', async () => {
		const { A, B } = await createRemotePair();
		let received: unknown = null;
		// A subscribes to echo events from B
		await A.sub('B', 'echo', (api: IEventApi) => { received = api.payload; });
		// B listens for ping from A, relays as echo to self (relay sends to A)
		B.listen('ping', ANY, async (api: IEventApi) => {
			await B.pub('.', 'echo', { echoed: api.payload });
		});
		await A.pub('B', 'ping', { original: true });
		expect(received).toEqual({ echoed: { original: true } });
	});
});
