// a generic prefix trie over segments split by a given separator, supporting *
// (exactly one segment) and ** (zero or more) wildcards at any level. * and **
// are routing edges only; a pattern's values live on an explicit terminal child
// reached after the last segment. values carry an instance-local insertion
// sequence so a match returns them in install order regardless of which wildcard
// branch reached them.

const STAR = "*";
const STARSTAR = "**";

interface ITrieEntry<T> {
	value: T;
	seq: number;
}

interface ITrieNode<T> {
	named: Record<string, ITrieNode<T>>;
	star?: ITrieNode<T>;
	starstar?: ITrieNode<T>;
	// the terminal child: values whose pattern ends at this node. routing edges
	// (named/star/starstar) never hold values themselves; only this does.
	terminal?: Array<ITrieEntry<T>>;
}

function makeNode<T>(): ITrieNode<T> {
	return { named: {} };
}

export class SegmentTrie<T> {
	private readonly sep: string;
	private root: ITrieNode<T>;
	private seq: number;

	constructor(sep: string) {
		this.sep = sep;
		this.root = makeNode<T>();
		this.seq = 0;
	}

	public split(raw: string): Array<string> {
		return raw.split(this.sep).filter((s) => s.length > 0);
	}

	// insert a value under a pattern. * and ** become wildcard routing edges; the
	// value is placed on the terminal of the node reached after the last segment.
	public insert(pattern: string, value: T): void {
		const segs = this.split(pattern);
		let node = this.root;
		for (const seg of segs) {
			if (seg === STARSTAR) {
				if (!node.starstar) node.starstar = makeNode<T>();
				node = node.starstar;
			}
			else if (seg === STAR) {
				if (!node.star) node.star = makeNode<T>();
				node = node.star;
			}
			else {
				if (!node.named[seg]) node.named[seg] = makeNode<T>();
				node = node.named[seg];
			}
		}
		if (!node.terminal) node.terminal = [];
		node.terminal.push({ value, seq: this.seq });
		this.seq += 1;
	}

	// retrieve the values stored at the exact pattern bucket. * and ** are treated
	// as literal edges (no glob), so this addresses the one bucket an insert with
	// the same pattern wrote to. returns the terminal values in install order, or
	// an empty array if the bucket does not exist.
	public retrieve(pattern: string): Array<T> {
		const segs = this.split(pattern);
		let node: ITrieNode<T> | undefined = this.root;
		for (const seg of segs) {
			if (!node) return [];
			node = seg === STARSTAR ? node.starstar : seg === STAR ? node.star : node.named[seg];
		}
		if (!node || !node.terminal) return [];
		return node.terminal.slice().sort((a, b) => a.seq - b.seq).map((e) => e.value);
	}

	// match a concrete (wildcard-free) key, returning values whose pattern matches,
	// in install order. dedup guards against a value reached more than once via
	// overlapping ** paths.
	public match(key: string): Array<T> {
		const segs = this.split(key);
		const found: Array<ITrieEntry<T>> = [];
		this.walk(this.root, segs, 0, found);
		found.sort((a, b) => a.seq - b.seq);
		const out: Array<T> = [];
		const seen: Record<number, boolean> = {};
		for (const e of found) {
			if (seen[e.seq]) continue;
			seen[e.seq] = true;
			out.push(e.value);
		}
		return out;
	}

	private walk(node: ITrieNode<T>, segs: Array<string>, i: number, found: Array<ITrieEntry<T>>): void {
		if (i >= segs.length) {
			if (node.terminal) for (const e of node.terminal) found.push(e);
		}
		else {
			const seg = segs[i];
			if (node.named[seg]) this.walk(node.named[seg], segs, i + 1, found);
			if (node.star) this.walk(node.star, segs, i + 1, found);
		}
		// a ** edge absorbs zero or more segments from the current position, then
		// continues from its child. try every split point >= i, including i itself
		// (zero absorbed). reachable whether or not segments remain.
		if (node.starstar) {
			for (let j = i; j <= segs.length; j += 1) this.walk(node.starstar, segs, j, found);
		}
	}

	// remove one value stored under a pattern, then prune now-empty branches.
	public remove(pattern: string, value: T): void {
		const segs = this.split(pattern);
		this.removeAt(this.root, segs, 0, value);
	}

	private removeAt(node: ITrieNode<T>, segs: Array<string>, i: number, value: T): boolean {
		if (i >= segs.length) {
			if (node.terminal) {
				node.terminal = node.terminal.filter((e) => e.value !== value);
				if (node.terminal.length === 0) delete node.terminal;
			}
		}
		else {
			const seg = segs[i];
			const child = seg === STARSTAR ? node.starstar : seg === STAR ? node.star : node.named[seg];
			if (child && this.removeAt(child, segs, i + 1, value)) {
				if (seg === STARSTAR) delete node.starstar;
				else if (seg === STAR) delete node.star;
				else delete node.named[seg];
			}
		}
		return this.isEmpty(node);
	}

	private isEmpty(node: ITrieNode<T>): boolean {
		return !node.terminal
			&& !node.star
			&& !node.starstar
			&& Object.keys(node.named).length === 0;
	}
}