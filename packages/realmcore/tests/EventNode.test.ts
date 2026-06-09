import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	EventNode,
	parsePath,
	computeTargetAddr,
	hasWildcard,
	matchAddr,
	type TCallback,
	type TCallbackId,
	type IEventApi,
} from '../src/events/EventNode';

// Helpers
function createTree(): { root: EventNode; a: EventNode; b: EventNode; a1: EventNode; a2: EventNode; b1: EventNode } {
	const root = new EventNode('root', true);
	const a = new EventNode('a', false);
	const b = new EventNode('b', false);
	const a1 = new EventNode('a1', false);
	const a2 = new EventNode('a2', false);
	const b1 = new EventNode('b1', false);
	root.addChild(a);
	root.addChild(b);
	a.addChild(a1);
	a.addChild(a2);
	b.addChild(b1);
	return { root, a, b, a1, a2, b1 };
}

function createDeepTree(): { root: EventNode; a: EventNode; a_b: EventNode; a_b_c: EventNode } {
	const root = new EventNode('root', true);
	const a = new EventNode('a', false);
	const a_b = new EventNode('b', false);
	const a_b_c = new EventNode('c', false);
	root.addChild(a);
	a.addChild(a_b);
	a_b.addChild(a_b_c);
	return { root, a, a_b, a_b_c };
}

// Listen from any source — wildcard pattern that matches all
const ANY = '/**';

// ============================================================
// LAYER 0: Path utilities
// ============================================================

describe('parsePath', () => {
	it('parses absolute path', () => {
		const p = parsePath('/a/b/c');
		expect(p.isAbsolute).toBe(true);
		expect(p.segments).toEqual(['a', 'b', 'c']);
	});

	it('parses relative path', () => {
		const p = parsePath('a/b/c');
		expect(p.isAbsolute).toBe(false);
		expect(p.segments).toEqual(['a', 'b', 'c']);
	});

	it('strips self segments', () => {
		const p = parsePath('./a/./b/.');
		expect(p.isAbsolute).toBe(false);
		expect(p.segments).toEqual(['a', 'b']);
	});

	it('strips empty segments', () => {
		const p = parsePath('a//b///c');
		expect(p.segments).toEqual(['a', 'b', 'c']);
	});

	it('handles root absolute', () => {
		const p = parsePath('/');
		expect(p.isAbsolute).toBe(true);
		expect(p.segments).toEqual([]);
	});

	it('preserves .. segments', () => {
		const p = parsePath('../a/b');
		expect(p.isAbsolute).toBe(false);
		expect(p.segments).toEqual(['..', 'a', 'b']);
	});

	it('preserves wildcard segments', () => {
		const p = parsePath('a/*/b/**/c');
		expect(p.segments).toEqual(['a', '*', 'b', '**', 'c']);
	});
});

describe('computeTargetAddr', () => {
	it('absolute path returns as-is', () => {
		expect(computeTargetAddr('/root', parsePath('/a/b/c'))).toBe('/a/b/c');
	});

	it('relative path appends to source', () => {
		expect(computeTargetAddr('/root/a', parsePath('b/c'))).toBe('/root/a/b/c');
	});

	it('.. pops from source', () => {
		expect(computeTargetAddr('/root/a/b', parsePath('../c'))).toBe('/root/a/c');
	});

	it('multiple .. pop multiple levels', () => {
		expect(computeTargetAddr('/root/a/b/c', parsePath('../../d'))).toBe('/root/a/d');
	});

	it('wildcard segments stay literal', () => {
		expect(computeTargetAddr('/root', parsePath('a/*/b'))).toBe('/root/a/*/b');
	});

	it('throws on .. after wildcard', () => {
		expect(() => computeTargetAddr('/root', parsePath('a/*/../b'))).toThrow("'..' after a wildcard segment is undefined");
	});

	it('throws on path above root', () => {
		expect(() => computeTargetAddr('/', parsePath('../a'))).toThrow("path walks above root");
	});

	it('self path resolves to own addr', () => {
		expect(computeTargetAddr('/root/a', parsePath('.'))).toBe('/root/a');
	});
});

describe('hasWildcard', () => {
	it('detects *', () => {
		expect(hasWildcard('/a/*/b')).toBe(true);
	});

	it('detects **', () => {
		expect(hasWildcard('/a/**/b')).toBe(true);
	});

	it('returns false for plain addr', () => {
		expect(hasWildcard('/a/b/c')).toBe(false);
	});
});

describe('matchAddr', () => {
	it('exact match', () => {
		expect(matchAddr('/a/b/c', '/a/b/c')).toBe(true);
	});

	it('* matches exactly one segment', () => {
		expect(matchAddr('/a/*/c', '/a/b/c')).toBe(true);
		expect(matchAddr('/a/*/c', '/a/x/c')).toBe(true);
		expect(matchAddr('/a/*/c', '/a/b/d')).toBe(false);
		expect(matchAddr('/a/*/c', '/a/b/d/c')).toBe(false);
	});

	it('** matches zero segments', () => {
		expect(matchAddr('/a/**/c', '/a/c')).toBe(true);
	});

	it('** matches one segment', () => {
		expect(matchAddr('/a/**/c', '/a/b/c')).toBe(true);
	});

	it('** matches multiple segments', () => {
		expect(matchAddr('/a/**/e', '/a/b/c/d/e')).toBe(true);
	});

	it('no match returns false', () => {
		expect(matchAddr('/a/b/c', '/x/y/z')).toBe(false);
	});

	it('* at end matches', () => {
		expect(matchAddr('/a/*', '/a/b')).toBe(true);
		expect(matchAddr('/a/*', '/a/b/c')).toBe(false);
	});

	it('** at end matches remaining', () => {
		expect(matchAddr('/a/**', '/a/b/c/d')).toBe(true);
		expect(matchAddr('/a/**', '/a')).toBe(true);
	});

	it('/** matches any non-empty addr', () => {
		expect(matchAddr('/**', '/root')).toBe(true);
		expect(matchAddr('/**', '/root/a/b')).toBe(true);
	});
});

// ============================================================
// LAYER 1: pub / sub (core dispatch)
// ============================================================

describe('pub - self targeted', () => {
	it('fires listener with correct payload', async () => {
		const { a } = createTree();
		let received: unknown = null;
		a.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('.', 'test', { foo: 1 });
		expect(received).toEqual({ foo: 1 });
	});

	it('fires listener from self path', async () => {
		const { a } = createTree();
		let called = false;
		a.listen('test', ANY, (api: IEventApi) => { called = true; });
		await a.pub('.', 'test', 'data');
		expect(called).toBe(true);
	});

	it('fires multiple listeners on same target', async () => {
		const { a } = createTree();
		const results: unknown[] = [];
		a.listen('test', ANY, (api: IEventApi) => { results.push(api.payload); });
		a.listen('test', ANY, (api: IEventApi) => { results.push(api.payload); });
		await a.pub('.', 'test', 'val');
		expect(results).toEqual(['val', 'val']);
	});

	it('no listeners returns undefined', async () => {
		const { a } = createTree();
		const result = await a.pub('.', 'test', 'data');
		expect(result).toBeUndefined();
	});

	it('different event names do not cross-fire', async () => {
		const { a } = createTree();
		let called = false;
		a.listen('other', ANY, () => { called = true; });
		await a.pub('.', 'test', 'data');
		expect(called).toBe(false);
	});
});

describe('pub - down to child', () => {
	it('relative path to child', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		a.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await root.pub('a', 'test', { down: true });
		expect(received).toEqual({ down: true });
	});

	it('absolute path to child', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		a.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await root.pub('/root/a', 'test', { abs: true });
		expect(received).toEqual({ abs: true });
	});

	it('pub to grandchild', async () => {
		const { root, a1 } = createTree();
		let received: unknown = null;
		a1.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await root.pub('a/a1', 'test', { deep: true });
		expect(received).toEqual({ deep: true });
	});

	it('throws on missing child in path', async () => {
		const { root } = createTree();
		await expect(root.pub('nonexistent', 'test')).rejects.toThrow('route missing child');
	});
});

describe('pub - up to parent', () => {
	it('relative .. to parent', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		root.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('..', 'test', { up: true });
		expect(received).toEqual({ up: true });
	});

	it('absolute path to parent', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		root.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('/root', 'test', { absUp: true });
		expect(received).toEqual({ absUp: true });
	});
});

describe('pub - cross-sibling', () => {
	it('relative .. to sibling', async () => {
		const { a, b } = createTree();
		let received: unknown = null;
		b.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('../b', 'test', { sibling: true });
		expect(received).toEqual({ sibling: true });
	});

	it('absolute path to sibling', async () => {
		const { a, b } = createTree();
		let received: unknown = null;
		b.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('/root/b', 'test', { absSibling: true });
		expect(received).toEqual({ absSibling: true });
	});

	it('cross-sibling to grandchild', async () => {
		const { a, b1 } = createTree();
		let received: unknown = null;
		b1.listen('test', ANY, (api: IEventApi) => { received = api.payload; });
		await a.pub('../b/b1', 'test', { crossDeep: true });
		expect(received).toEqual({ crossDeep: true });
	});
});

describe('pub - wildcard routing', () => {
	it('* fans to all immediate children', async () => {
		const { root, a, b } = createTree();
		const results: string[] = [];
		a.listen('test', ANY, (api: IEventApi) => { results.push('a'); });
		b.listen('test', ANY, (api: IEventApi) => { results.push('b'); });
		await root.pub('*', 'test', { wild: true });
		expect(results.sort()).toEqual(['a', 'b']);
	});

	it('** fans to all descendants', async () => {
		const { root, a, a1, a2 } = createTree();
		const results: string[] = [];
		a.listen('test', ANY, (api: IEventApi) => { results.push('a'); });
		a1.listen('test', ANY, (api: IEventApi) => { results.push('a1'); });
		a2.listen('test', ANY, (api: IEventApi) => { results.push('a2'); });
		await root.pub('a/**', 'test', { deepWild: true });
		expect(results.sort()).toEqual(['a', 'a1', 'a2']);
	});

	it('* at root reaches all direct children', async () => {
		const { root, a, b } = createTree();
		let aCalled = false, bCalled = false;
		a.listen('test', ANY, () => { aCalled = true; });
		b.listen('test', ANY, () => { bCalled = true; });
		await root.pub('*', 'test');
		expect(aCalled).toBe(true);
		expect(bCalled).toBe(true);
	});

	it('** from root reaches entire tree', async () => {
		const { root, a, b, a1, a2, b1 } = createTree();
		const results: string[] = [];
		root.listen('test', ANY, (api: IEventApi) => { results.push('root'); });
		a.listen('test', ANY, (api: IEventApi) => { results.push('a'); });
		b.listen('test', ANY, (api: IEventApi) => { results.push('b'); });
		a1.listen('test', ANY, (api: IEventApi) => { results.push('a1'); });
		a2.listen('test', ANY, (api: IEventApi) => { results.push('a2'); });
		b1.listen('test', ANY, (api: IEventApi) => { results.push('b1'); });
		await root.pub('/**', 'test');
		expect(results.sort()).toEqual(['a', 'a1', 'a2', 'b', 'b1', 'root']);
	});
});

describe('pub - listener source matching', () => {
	it('exact source match', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		root.listen('test', a.nodeAddr, (api: IEventApi) => { received = api.payload; });
		await a.pub('..', 'test', { exact: true });
		expect(received).toEqual({ exact: true });
	});

	it('wildcard source pattern matches', async () => {
		const { root, a, b } = createTree();
		const sources: string[] = [];
		root.listen('test', '/root/*', (api: IEventApi) => { sources.push(api.event.sourceAddr); });
		await a.pub('..', 'test', { fromA: true });
		await b.pub('..', 'test', { fromB: true });
		expect(sources).toContain('/root/a');
		expect(sources).toContain('/root/b');
	});

	it('** source pattern matches all descendants', async () => {
		const { root, a, a1 } = createTree();
		const sources: string[] = [];
		root.listen('test', '/root/**', (api: IEventApi) => { sources.push(api.event.sourceAddr); });
		await a.pub('..', 'test', { fromA: true });
		await a1.pub('../..', 'test', { fromA1: true });
		expect(sources).toContain('/root/a');
		expect(sources).toContain('/root/a/a1');
	});

	it('non-matching source pattern does not fire', async () => {
		const { root, a } = createTree();
		let called = false;
		root.listen('test', '/other/*', (api: IEventApi) => { called = true; });
		await a.pub('..', 'test', { fromA: true });
		expect(called).toBe(false);
	});
});

describe('pub - response modes', () => {
	it('expectResponse collects handler return', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => 42);
		const result = await a.pub('.', 'test', null, { expectResponse: true });
		expect(result).toBe(42);
	});

	it('fire-and-forget ignores returns', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => 42);
		const result = await a.pub('.', 'test', null, { expectResponse: false });
		expect(result).toBeUndefined();
	});
});

describe('pub - edge cases', () => {
	it('detached node pub throws', async () => {
		const { root, a } = createTree();
		await root.removeChild('a');
		expect(a.nodeAddr).toBe('');
		await expect(async () => a.pub('..', 'test')).rejects.toThrow();
	});

	it('relative .. above root throws', async () => {
		const root = new EventNode('root', true);
		await expect(root.pub('..', 'test')).rejects.toThrow();
	});

	it('no listeners with expectResponse returns seed', async () => {
		const { a } = createTree();
		const result = await a.pub('.', 'test', null, { expectResponse: true, seed: 'seed-val' });
		expect(result).toBe('seed-val');
	});

	it('no listeners with expectResponse and no seed returns undefined', async () => {
		const { a } = createTree();
		const result = await a.pub('.', 'test', null, { expectResponse: true });
		expect(result).toBeUndefined();
	});
});

// ============================================================
// sub (relay-based subscription)
// ============================================================

describe('sub - self subscription', () => {
	it('sub on self is just local listen', async () => {
		const { a } = createTree();
		let received: unknown = null;
		await a.sub('.', 'test', (api: IEventApi) => { received = api.payload; });
		await a.pub('.', 'test', { selfSub: true });
		expect(received).toEqual({ selfSub: true });
	});
});

describe('sub - remote subscription', () => {
	it('sub on child relays events up', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		await root.sub('a', 'test', (api: IEventApi) => { received = api.payload; });
		await a.pub('.', 'test', { fromChild: true });
		expect(received).toEqual({ fromChild: true });
	});

	it('sub on parent relays events down', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		await a.sub('..', 'test', (api: IEventApi) => { received = api.payload; });
		await root.pub('.', 'test', { fromParent: true });
		expect(received).toEqual({ fromParent: true });
	});

	it('sub on grandchild', async () => {
		const { root, a1 } = createTree();
		let received: unknown = null;
		await root.sub('a/a1', 'test', (api: IEventApi) => { received = api.payload; });
		await a1.pub('.', 'test', { fromGrandchild: true });
		expect(received).toEqual({ fromGrandchild: true });
	});

	it('sub with wildcard target fans relay to all matching', async () => {
		const { root, a, b } = createTree();
		const sources: string[] = [];
		await root.sub('*', 'test', (api: IEventApi) => { sources.push(api.event.sourceAddr); });
		await a.pub('.', 'test', { fromA: true });
		await b.pub('.', 'test', { fromB: true });
		expect(sources).toContain('/root/a');
		expect(sources).toContain('/root/b');
	});
});

describe('sub - unsub', () => {
	it('unsub removes relay', async () => {
		const { root, a } = createTree();
		let count = 0;
		const id = await root.sub('a', 'test', (api: IEventApi) => { count++; });
		await a.pub('.', 'test', { before: true });
		expect(count).toBe(1);
		await root.unsub('a', id);
		await a.pub('.', 'test', { after: true });
		expect(count).toBe(1);
	});

	it('unsub non-existent id does not throw', async () => {
		const { a } = createTree();
		await expect(a.unsub('.', 'nonexistent')).resolves.toBeUndefined();
	});
});

describe('sub - purgeSubscriber', () => {
	it('purges all relay IDs for a subscriber', async () => {
		const { root, a } = createTree();
		let count = 0;
		await root.sub('a', 'test', (api: IEventApi) => { count++; });
		await root.sub('a', 'other', (api: IEventApi) => { count++; });
		await a.pub('.', 'test', { first: true });
		await a.pub('.', 'other', { second: true });
		expect(count).toBe(2);
		a.purgeSubscriber(root.nodeAddr);
		await a.pub('.', 'test', { third: true });
		await a.pub('.', 'other', { fourth: true });
		expect(count).toBe(2);
	});
});

// ============================================================
// LAYER 2: broadcast, pipe, survey, on, hook
// ============================================================

describe('broadcast', () => {
	it('fire-and-forget on self', async () => {
		const { a } = createTree();
		let called = false;
		a.listen('test', ANY, () => { called = true; });
		const result = await a.broadcast('test', { data: true });
		expect(called).toBe(true);
		expect(result).toBeUndefined();
	});

	it('broadcast to children', async () => {
		const { root, a, b } = createTree();
		const results: string[] = [];
		a.listen('test', ANY, () => { results.push('a'); });
		b.listen('test', ANY, () => { results.push('b'); });
		await root.broadcast('test', null, '*');
		expect(results.sort()).toEqual(['a', 'b']);
	});

	it('broadcast ignores handler return values', async () => {
		const { a } = createTree();
		a.listen('test', ANY, () => 'ignored');
		const result = await a.broadcast('test');
		expect(result).toBeUndefined();
	});
});

describe('pipe', () => {
	it('sequential result threading on self', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => (api.result as number) + 1);
		a.listen('test', ANY, (api: IEventApi) => (api.result as number) * 2);
		const result = await a.pipe('test', null, '.', 10);
		expect(result).toBe(22);
	});

	it('pipe with seed', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => {
			const arr = api.result as number[];
			arr.push(1);
			return arr;
		});
		const result = await a.pipe('test', null, '.', [0]);
		expect(result).toEqual([0, 1]);
	});

	it('pipe to remote target', async () => {
		const { root, a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => (api.result as number) + 100);
		const result = await root.pipe('test', null, 'a', 50);
		expect(result).toBe(150);
	});

	it('pipe with no listeners returns seed', async () => {
		const { a } = createTree();
		const result = await a.pipe('test', null, '.', 'seed');
		expect(result).toBe('seed');
	});
});

describe('pipe - next() middleware stack', () => {
	it('no next() call — framework advances automatically', async () => {
		const { a } = createTree();
		const order: string[] = [];
		a.listen('test', ANY, (api: IEventApi) => { order.push('A'); return (api.result as number) + 1; });
		a.listen('test', ANY, (api: IEventApi) => { order.push('B'); return (api.result as number) + 10; });
		a.listen('test', ANY, (api: IEventApi) => { order.push('C'); return (api.result as number) * 2; });
		const result = await a.pipe('test', null, '.', 0);
		expect(order).toEqual(['A', 'B', 'C']);
		expect(result).toBe(22);
	});

	it('next() post-processes downstream result', async () => {
		const { a } = createTree();
		a.listen('test', ANY, async (api: IEventApi) => {
			const downstream = await api.next();
			return `${downstream}-wrapped`;
		});
		a.listen('test', ANY, (api: IEventApi) => 'core');
		const result = await a.pipe('test', null, '.', 0);
		expect(result).toBe('core-wrapped');
	});

	it('next() passthrough — returns downstream unchanged', async () => {
		const { a } = createTree();
		a.listen('test', ANY, async (api: IEventApi) => {
			return api.next();
		});
		a.listen('test', ANY, (api: IEventApi) => 'deep');
		const result = await a.pipe('test', null, '.', 0);
		expect(result).toBe('deep');
	});

	it('handler returns undefined — result unchanged', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => (api.result as number) + 1);
		a.listen('test', ANY, () => undefined);
		a.listen('test', ANY, (api: IEventApi) => (api.result as number) + 100);
		const result = await a.pipe('test', null, '.', 0);
		expect(result).toBe(101);
	});

	it('mixed next() and no-next handlers', async () => {
		const { a } = createTree();
		const order: string[] = [];
		// A uses next(), B does not, C does not
		a.listen('test', ANY, async (api: IEventApi) => {
			order.push('A-pre');
			const downstream = await api.next();
			order.push('A-post');
			return (downstream as number) * 2;
		});
		a.listen('test', ANY, (api: IEventApi) => {
			order.push('B');
			return (api.result as number) + 1;
		});
		a.listen('test', ANY, (api: IEventApi) => {
			order.push('C');
			return (api.result as number) + 10;
		});
		const result = await a.pipe('test', null, '.', 0);
		expect(order).toEqual(['A-pre', 'B', 'C', 'A-post']);
		expect(result).toBe(22);
	});

	it('nested next() — multiple handlers drive chain', async () => {
		const { a } = createTree();
		a.listen('test', ANY, async (api: IEventApi) => {
			const d = await api.next();
			return `[${d}]`;
		});
		a.listen('test', ANY, async (api: IEventApi) => {
			const d = await api.next();
			return `{${d}}`;
		});
		a.listen('test', ANY, (api: IEventApi) => 'core');
		const result = await a.pipe('test', null, '.', 0);
		expect(result).toBe('[{core}]');
	});

	it('next() after last handler returns current result', async () => {
		const { a } = createTree();
		let nextResult: unknown = null;
		a.listen('test', ANY, (api: IEventApi) => 42);
		a.listen('test', ANY, async (api: IEventApi) => {
			nextResult = await api.next();
			return 'last';
		});
		const result = await a.pipe('test', null, '.', 0);
		expect(nextResult).toBe(42);
		expect(result).toBe('last');
	});

	it('next() outside sequential is no-op', async () => {
		const { a } = createTree();
		let nextCalled = false;
		a.listen('test', ANY, async (api: IEventApi) => {
			nextCalled = true;
			const nr = await api.next();
			expect(nr).toBeUndefined();
		});
		await a.pub('.', 'test', null, { expectResponse: false });
		expect(nextCalled).toBe(true);
	});

	it('next() in parallel mode is no-op', async () => {
		const { a } = createTree();
		let nextCalled = false;
		a.listen('test', ANY, async (api: IEventApi) => {
			nextCalled = true;
			const nr = await api.next();
			expect(nr).toBeUndefined();
		});
		a.listen('test', ANY, () => 'other');
		const result = await a.pub('.', 'test', null, { expectResponse: true, isParallel: true });
		expect(nextCalled).toBe(true);
		expect(Array.isArray(result)).toBe(true);
	});

	it('next() with transform — timing pattern', async () => {
		const { a } = createTree();
		const timings: string[] = [];
		a.listen('test', ANY, async (api: IEventApi) => {
			timings.push('before');
			const out = await api.next();
			timings.push('after');
			return { ...out as object, timed: true };
		});
		a.listen('test', ANY, (api: IEventApi) => {
			timings.push('handler');
			return { value: (api.result as number) * 3 };
		});
		const result = await a.pipe('test', null, '.', 10);
		expect(timings).toEqual(['before', 'handler', 'after']);
		expect(result).toEqual({ value: 30, timed: true });
	});

	it('next() with seed propagation', async () => {
		const { a } = createTree();
		a.listen('test', ANY, async (api: IEventApi) => {
			const downstream = await api.next();
			return `${api.seed} -> ${downstream}`;
		});
		a.listen('test', ANY, (api: IEventApi) => {
			return (api.result as number) + 1;
		});
		const result = await a.pipe('test', null, '.', 10);
		expect(result).toBe('10 -> 11');
	});

	it('handler skips next() after sibling used next()', async () => {
		const { a } = createTree();
		const order: string[] = [];
		// A does not use next
		a.listen('test', ANY, (api: IEventApi) => {
			order.push('A');
			return (api.result as number) + 1;
		});
		// B uses next
		a.listen('test', ANY, async (api: IEventApi) => {
			order.push('B-pre');
			const d = await api.next();
			order.push('B-post');
			return (d as number) + 100;
		});
		// C does not use next
		a.listen('test', ANY, (api: IEventApi) => {
			order.push('C');
			return (api.result as number) * 2;
		});
		const result = await a.pipe('test', null, '.', 0);
		expect(order).toEqual(['A', 'B-pre', 'C', 'B-post']);
		expect(result).toBe(102);
	});
});

describe('survey', () => {
	it('parallel result collection on self', async () => {
		const { a } = createTree();
		a.listen('test', ANY, (api: IEventApi) => 'result-a');
		a.listen('test', ANY, (api: IEventApi) => 'result-b');
		const result = await a.survey('test', null);
		expect(result).toEqual(expect.arrayContaining(['result-a', 'result-b']));
	});

	it('survey to children collects all', async () => {
		const { root, a, b } = createTree();
		a.listen('test', ANY, (api: IEventApi) => 'from-a');
		b.listen('test', ANY, (api: IEventApi) => 'from-b');
		const result = await root.survey('test', null, '*');
		expect(result).toEqual(expect.arrayContaining(['from-a', 'from-b']));
	});

	it('survey with no listeners returns empty array', async () => {
		const { a } = createTree();
		const result = await a.survey('test', null);
		expect(result).toEqual([]);
	});
});

describe('on', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('subscribes and fires callback', async () => {
		const { root, a } = createTree();
		let called = false;
		await root.on('a', 'test', (api: IEventApi) => { called = true; });
		await a.pub('.', 'test', { data: true });
		expect(called).toBe(true);
	});

	it('discards handler return value', async () => {
		const { root, a } = createTree();
		await root.on('a', 'test', (api: IEventApi) => 'should-be-discarded');
		await a.pub('.', 'test', { data: true });
	});
});

describe('hook', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('subscribes and passes handler return through', async () => {
		const { root, a } = createTree();
		let received: unknown = null;
		await root.hook('a', 'test', (api: IEventApi) => {
			received = api.payload;
			return 'hook-result';
		});
		const result = await a.pub('.', 'test', { hookData: true }, { expectResponse: true });
		expect(received).toEqual({ hookData: true });
		expect(result).toBe('hook-result');
	});
});

// ============================================================
// LAYER 3: fn, invoke
// ============================================================

describe('fn + invoke', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	it('fn declares handler, invoke calls it', async () => {
		const { root, a } = createTree();
		a.fn('greet', (api: IEventApi) => {
			const name = api.payload as string;
			return `hello ${name}`;
		});
		const result = await root.invoke('a', 'greet', 'world');
		expect(result).toBe('hello world');
	});

	it('invoke with seed', async () => {
		const { root, a } = createTree();
		a.fn('add', (api: IEventApi) => {
			const base = api.result as number;
			const val = api.payload as number;
			return base + val;
		});
		const result = await root.invoke('a', 'add', 10, 5);
		expect(result).toBe(15);
	});

	it('fn is callable from any node in tree', async () => {
		const { root, a, b } = createTree();
		a.fn('compute', (api: IEventApi) => {
			const val = api.payload as number;
			return val * 2;
		});
		const result = await b.invoke('../a', 'compute', 21);
		expect(result).toBe(42);
	});

	it('fn on self via invoke', async () => {
		const { a } = createTree();
		a.fn('double', (api: IEventApi) => {
			return (api.payload as number) * 2;
		});
		const result = await a.invoke('.', 'double', 7);
		expect(result).toBe(14);
	});
});

// ============================================================
// Tree structure
// ============================================================

describe('tree operations', () => {
	it('root node has correct addr', () => {
		const root = new EventNode('root', true);
		expect(root.nodeAddr).toBe('/root');
	});

	it('non-root node has empty addr initially', () => {
		const node = new EventNode('child', false);
		expect(node.nodeAddr).toBe('');
	});

	it('addChild sets parent and addr', async () => {
		const root = new EventNode('root', true);
		const child = new EventNode('child', false);
		await root.addChild(child);
		expect(child.nodeAddr).toBe('/root/child');
	});

	it('addChild cascades addr to grandchildren', async () => {
		const { root, a, a1 } = createTree();
		expect(a.nodeAddr).toBe('/root/a');
		expect(a1.nodeAddr).toBe('/root/a/a1');
	});

	it('duplicate child id throws', async () => {
		const root = new EventNode('root', true);
		const a = new EventNode('a', false);
		const b = new EventNode('a', false);
		await root.addChild(a);
		await expect(root.addChild(b)).rejects.toThrow('child id already exists');
	});

	it('removeChild detaches node', async () => {
		const { root, a } = createTree();
		await root.removeChild('a');
		expect(root.children['a']).toBeUndefined();
	});

	it('addParent cascades to children', async () => {
		const parent = new EventNode('parent', true);
		const child = new EventNode('child', false);
		const grandchild = new EventNode('gc', false);
		child.addChild(grandchild);
		await parent.addChild(child);
		expect(child.nodeAddr).toBe('/parent/child');
		expect(grandchild.nodeAddr).toBe('/parent/child/gc');
	});

	it('removeChild calls child removeParent', async () => {
		const { root, a } = createTree();
		await root.removeChild('a');
		expect(a.parent).toBeNull();
	});
});
