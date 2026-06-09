import { describe, it, expect } from 'vitest';
import { SegmentTrie } from './SegmentTrie';

// ============================================================
// Event namespace separator (.)
// ============================================================

describe('SegmentTrie - event namespace (.)', () => {
	let trie: SegmentTrie<string>;

	function create(): SegmentTrie<string> {
		return new SegmentTrie('.');
	}

	it('split - basic', () => {
		expect(create().split('x.y.z')).toEqual(['x', 'y', 'z']);
	});

	it('split - leading/trailing dots stripped', () => {
		expect(create().split('.x.y.')).toEqual(['x', 'y']);
	});

	it('split - empty string', () => {
		expect(create().split('')).toEqual([]);
	});

	it('split - bare dot', () => {
		expect(create().split('.')).toEqual([]);
	});

	it('insert + match - exact', () => {
		trie = create();
		trie.insert('x.y.z', 'exact');
		expect(trie.match('x.y.z')).toEqual(['exact']);
	});

	it('match - no match', () => {
		trie = create();
		trie.insert('x.y.z', 'val');
		expect(trie.match('x.w.z')).toEqual([]);
	});

	it('match - multiple values different patterns', () => {
		trie = create();
		trie.insert('x.y.z', 'a');
		trie.insert('x.w.z', 'b');
		expect(trie.match('x.y.z')).toEqual(['a']);
		expect(trie.match('x.w.z')).toEqual(['b']);
	});

	it('* - matches any single segment mid', () => {
		trie = create();
		trie.insert('x.*.z', 'wild');
		expect(trie.match('x.any.z')).toEqual(['wild']);
	});

	it('* - at start', () => {
		trie = create();
		trie.insert('*.y.z', 'wild');
		expect(trie.match('x.y.z')).toEqual(['wild']);
	});

	it('* - at end', () => {
		trie = create();
		trie.insert('x.y.*', 'wild');
		expect(trie.match('x.y.anything')).toEqual(['wild']);
	});

	it('* - does NOT match zero segments', () => {
		trie = create();
		trie.insert('x.*.z', 'wild');
		expect(trie.match('x.z')).toEqual([]);
	});

	it('* - does NOT match two segments', () => {
		trie = create();
		trie.insert('x.*.z', 'wild');
		expect(trie.match('x.a.b.z')).toEqual([]);
	});

	it('* - multiple * in pattern', () => {
		trie = create();
		trie.insert('*.*.*', 'triple');
		expect(trie.match('a.b.c')).toEqual(['triple']);
		expect(trie.match('x.y.z')).toEqual(['triple']);
	});

	it('** - matches zero segments at end', () => {
		trie = create();
		trie.insert('x.**', 'deep');
		expect(trie.match('x')).toEqual(['deep']);
	});

	it('** - matches one segment at end', () => {
		trie = create();
		trie.insert('x.**', 'deep');
		expect(trie.match('x.y')).toEqual(['deep']);
	});

	it('** - matches multiple segments at end', () => {
		trie = create();
		trie.insert('x.**', 'deep');
		expect(trie.match('x.y.z.w')).toEqual(['deep']);
	});

	it('** - zero absorbed mid-path', () => {
		trie = create();
		trie.insert('x.**.z', 'mid');
		expect(trie.match('x.z')).toEqual(['mid']);
	});

	it('** - multi absorbed mid-path', () => {
		trie = create();
		trie.insert('x.**.z', 'mid');
		expect(trie.match('x.a.b.c.z')).toEqual(['mid']);
	});

	it('** alone matches everything', () => {
		trie = create();
		trie.insert('**', 'all');
		expect(trie.match('')).toContain('all');
		expect(trie.match('a')).toContain('all');
		expect(trie.match('a.b.c')).toContain('all');
	});

	it('**.z matches z, a.z, a.b.z', () => {
		trie = create();
		trie.insert('**.z', 'end-z');
		expect(trie.match('z')).toContain('end-z');
		expect(trie.match('a.z')).toContain('end-z');
		expect(trie.match('a.b.z')).toContain('end-z');
	});

	it('ordering - results in insertion order', () => {
		trie = create();
		trie.insert('z.*', 'first');
		trie.insert('z.y', 'second');
		trie.insert('z.*', 'third');
		const result = trie.match('z.y');
		expect(result).toEqual(['first', 'second', 'third']);
	});

	it('dedup - same insertion reached via multiple ** paths', () => {
		trie = create();
		trie.insert('x.**.y.**', 'dstar');
		// 'x.a.y.b' can be reached: ** absorbs nothing before .y, or ** absorbs 'a' before .y
		// same terminal entry reached via multiple split points
		const result = trie.match('x.a.y.b');
		expect(result.filter(v => v === 'dstar').length).toBe(1);
	});

	it('dedup - different values under overlapping patterns', () => {
		trie = create();
		trie.insert('x.y', 'exact-val');
		trie.insert('x.*', 'wild-val');
		expect(trie.match('x.y')).toEqual(['exact-val', 'wild-val']);
	});

	it('combined wildcards - * and ** in same pattern', () => {
		trie = create();
		trie.insert('x.*.y.**', 'combo');
		expect(trie.match('x.a.y')).toContain('combo');
		expect(trie.match('x.a.y.b')).toContain('combo');
		expect(trie.match('x.a.y.b.c')).toContain('combo');
		expect(trie.match('x.a.z')).not.toContain('combo');
	});

	it('complex - exact + * + ** all match same key', () => {
		trie = create();
		trie.insert('x.y.z', 'exact');
		trie.insert('x.*.z', 'star');
		trie.insert('x.**', 'dstar');
		expect(trie.match('x.y.z')).toEqual(['exact', 'star', 'dstar']);
	});

	it('remove - exact entry', () => {
		trie = create();
		trie.insert('x.y.z', 'val');
		trie.remove('x.y.z', 'val');
		expect(trie.match('x.y.z')).toEqual([]);
	});

	it('remove - one of multiple values', () => {
		trie = create();
		trie.insert('x.*', 'a');
		trie.insert('x.*', 'b');
		trie.remove('x.*', 'a');
		expect(trie.match('x.y')).toEqual(['b']);
	});

	it('remove - prune empty branches', () => {
		trie = create();
		trie.insert('x.y.z', 'val');
		trie.insert('a.b', 'other');
		trie.remove('x.y.z', 'val');
		expect(trie.match('x.y.z')).toEqual([]);
		expect(trie.match('a.b')).toEqual(['other']);
	});

	it('remove - non-existent value is no-op', () => {
		trie = create();
		trie.insert('x.y.z', 'val');
		trie.remove('x.y.z', 'ghost');
		expect(trie.match('x.y.z')).toEqual(['val']);
	});

	it('remove - wildcard pattern entry', () => {
		trie = create();
		trie.insert('x.*', 'wild');
		trie.insert('x.y', 'exact');
		trie.remove('x.*', 'wild');
		expect(trie.match('x.y')).toEqual(['exact']);
		expect(trie.match('x.z')).toEqual([]);
	});

	it('edge - deep nesting', () => {
		trie = create();
		trie.insert('a.b.c.d.e.f', 'deep');
		expect(trie.match('a.b.c.d.e.f')).toEqual(['deep']);
	});

	it('edge - single segment', () => {
		trie = create();
		trie.insert('x', 'single');
		expect(trie.match('x')).toEqual(['single']);
		expect(trie.match('y')).toEqual([]);
	});

	it('edge - various value types', () => {
		trie = create();
		trie.insert('num', 42);
		trie.insert('obj', { key: 'val' });
		trie.insert('null', null as any);
		expect(trie.match('num')).toEqual([42]);
		expect(trie.match('obj')).toEqual([{ key: 'val' }]);
		expect(trie.match('null')).toEqual([null]);
	});

	it('remove - shared prefix, one removed other remains', () => {
		trie = create();
		trie.insert('x.y.z', 'a');
		trie.insert('x.y.w', 'b');
		trie.remove('x.y.z', 'a');
		expect(trie.match('x.y.z')).toEqual([]);
		expect(trie.match('x.y.w')).toEqual(['b']);
	});

	it('remove - pattern removed, match empty', () => {
		trie = create();
		trie.insert('x.**', 'val');
		trie.remove('x.**', 'val');
		expect(trie.match('x.y.z')).toEqual([]);
	});
});

// ============================================================
// Path separator (/)
// ============================================================

describe('SegmentTrie - path (/)', () => {
	let trie: SegmentTrie<string>;

	function create(): SegmentTrie<string> {
		return new SegmentTrie('/');
	}

	it('split - basic', () => {
		expect(create().split('/a/b/c')).toEqual(['a', 'b', 'c']);
	});

	it('split - double slash stripped', () => {
		expect(create().split('/a//b/')).toEqual(['a', 'b']);
	});

	it('split - empty string', () => {
		expect(create().split('')).toEqual([]);
	});

	it('split - bare slash', () => {
		expect(create().split('/')).toEqual([]);
	});

	it('insert + match - exact', () => {
		trie = create();
		trie.insert('/a/b/c', 'exact');
		expect(trie.match('/a/b/c')).toEqual(['exact']);
	});

	it('match - no match', () => {
		trie = create();
		trie.insert('/a/b/c', 'val');
		expect(trie.match('/a/x/c')).toEqual([]);
	});

	it('match - multiple values different patterns', () => {
		trie = create();
		trie.insert('/a/b/c', 'a');
		trie.insert('/a/x/c', 'b');
		expect(trie.match('/a/b/c')).toEqual(['a']);
		expect(trie.match('/a/x/c')).toEqual(['b']);
	});

	it('* - matches any single segment mid', () => {
		trie = create();
		trie.insert('/a/*/c', 'wild');
		expect(trie.match('/a/any/c')).toEqual(['wild']);
	});

	it('* - at start', () => {
		trie = create();
		trie.insert('/*/b/c', 'wild');
		expect(trie.match('/x/b/c')).toEqual(['wild']);
	});

	it('* - at end', () => {
		trie = create();
		trie.insert('/a/b/*', 'wild');
		expect(trie.match('/a/b/anything')).toEqual(['wild']);
	});

	it('* - does NOT match zero segments', () => {
		trie = create();
		trie.insert('/a/*/c', 'wild');
		expect(trie.match('/a/c')).toEqual([]);
	});

	it('* - does NOT match two segments', () => {
		trie = create();
		trie.insert('/a/*/c', 'wild');
		expect(trie.match('/a/x/y/c')).toEqual([]);
	});

	it('* - multiple * in pattern', () => {
		trie = create();
		trie.insert('*/*/*', 'triple');
		expect(trie.match('/a/b/c')).toEqual(['triple']);
		expect(trie.match('/x/y/z')).toEqual(['triple']);
	});

	it('** - matches zero segments at end', () => {
		trie = create();
		trie.insert('/a/**', 'deep');
		expect(trie.match('/a')).toEqual(['deep']);
	});

	it('** - matches one segment at end', () => {
		trie = create();
		trie.insert('/a/**', 'deep');
		expect(trie.match('/a/b')).toEqual(['deep']);
	});

	it('** - matches multiple segments at end', () => {
		trie = create();
		trie.insert('/a/**', 'deep');
		expect(trie.match('/a/b/c/d')).toEqual(['deep']);
	});

	it('** - zero absorbed mid-path', () => {
		trie = create();
		trie.insert('/a/**/c', 'mid');
		expect(trie.match('/a/c')).toEqual(['mid']);
	});

	it('** - multi absorbed mid-path', () => {
		trie = create();
		trie.insert('/a/**/c', 'mid');
		expect(trie.match('/a/x/y/z/c')).toEqual(['mid']);
	});

	it('** alone matches everything', () => {
		trie = create();
		trie.insert('**', 'all');
		expect(trie.match('')).toContain('all');
		expect(trie.match('/a')).toContain('all');
		expect(trie.match('/a/b/c')).toContain('all');
	});

	it('**/c matches c, /a/c, /a/b/c', () => {
		trie = create();
		trie.insert('**/c', 'end-c');
		expect(trie.match('/c')).toContain('end-c');
		expect(trie.match('/a/c')).toContain('end-c');
		expect(trie.match('/a/b/c')).toContain('end-c');
	});

	it('ordering - results in insertion order', () => {
		trie = create();
		trie.insert('/z/*', 'first');
		trie.insert('/z/y', 'second');
		trie.insert('/z/*', 'third');
		const result = trie.match('/z/y');
		expect(result).toEqual(['first', 'second', 'third']);
	});

	it('dedup - same insertion reached via multiple ** paths', () => {
		trie = create();
		trie.insert('/a/**/b/**', 'dstar');
		// '/a.x/b.y' can be reached via multiple ** split points
		const result = trie.match('/a/x/b/y');
		expect(result.filter(v => v === 'dstar').length).toBe(1);
	});

	it('dedup - different values under overlapping patterns', () => {
		trie = create();
		trie.insert('/a/b', 'exact-val');
		trie.insert('/a/*', 'wild-val');
		expect(trie.match('/a/b')).toEqual(['exact-val', 'wild-val']);
	});

	it('combined wildcards - * and ** in same pattern', () => {
		trie = create();
		trie.insert('/a/*/b/**', 'combo');
		expect(trie.match('/a/x/b')).toContain('combo');
		expect(trie.match('/a/x/b/c')).toContain('combo');
		expect(trie.match('/a/x/b/c/d')).toContain('combo');
		expect(trie.match('/a/x/c')).not.toContain('combo');
	});

	it('complex - exact + * + ** all match same key', () => {
		trie = create();
		trie.insert('/a/b/c', 'exact');
		trie.insert('/a/*/c', 'star');
		trie.insert('/a/**', 'dstar');
		expect(trie.match('/a/b/c')).toEqual(['exact', 'star', 'dstar']);
	});

	it('remove - exact entry', () => {
		trie = create();
		trie.insert('/a/b/c', 'val');
		trie.remove('/a/b/c', 'val');
		expect(trie.match('/a/b/c')).toEqual([]);
	});

	it('remove - one of multiple values', () => {
		trie = create();
		trie.insert('/a/*', 'a');
		trie.insert('/a/*', 'b');
		trie.remove('/a/*', 'a');
		expect(trie.match('/a/x')).toEqual(['b']);
	});

	it('remove - prune empty branches', () => {
		trie = create();
		trie.insert('/a/b/c', 'val');
		trie.insert('/x/y', 'other');
		trie.remove('/a/b/c', 'val');
		expect(trie.match('/a/b/c')).toEqual([]);
		expect(trie.match('/x/y')).toEqual(['other']);
	});

	it('remove - non-existent value is no-op', () => {
		trie = create();
		trie.insert('/a/b/c', 'val');
		trie.remove('/a/b/c', 'ghost');
		expect(trie.match('/a/b/c')).toEqual(['val']);
	});

	it('remove - wildcard pattern entry', () => {
		trie = create();
		trie.insert('/a/*', 'wild');
		trie.insert('/a/b', 'exact');
		trie.remove('/a/*', 'wild');
		expect(trie.match('/a/b')).toEqual(['exact']);
		expect(trie.match('/a/z')).toEqual([]);
	});

	it('edge - deep nesting', () => {
		trie = create();
		trie.insert('/a/b/c/d/e/f', 'deep');
		expect(trie.match('/a/b/c/d/e/f')).toEqual(['deep']);
	});

	it('edge - single segment', () => {
		trie = create();
		trie.insert('/a', 'single');
		expect(trie.match('/a')).toEqual(['single']);
		expect(trie.match('/b')).toEqual([]);
	});

	it('edge - various value types', () => {
		trie = create();
		trie.insert('/num', 42);
		trie.insert('/obj', { key: 'val' });
		trie.insert('/null', null as any);
		expect(trie.match('/num')).toEqual([42]);
		expect(trie.match('/obj')).toEqual([{ key: 'val' }]);
		expect(trie.match('/null')).toEqual([null]);
	});

	it('remove - shared prefix, one removed other remains', () => {
		trie = create();
		trie.insert('/a/b/c', 'a');
		trie.insert('/a/b/d', 'b');
		trie.remove('/a/b/c', 'a');
		expect(trie.match('/a/b/c')).toEqual([]);
		expect(trie.match('/a/b/d')).toEqual(['b']);
	});

	it('remove - pattern removed, match empty', () => {
		trie = create();
		trie.insert('/a/**', 'val');
		trie.remove('/a/**', 'val');
		expect(trie.match('/a/b/c')).toEqual([]);
	});
});
