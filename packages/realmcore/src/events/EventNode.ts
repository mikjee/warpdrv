import { nanoid } from "nanoid";

// types

export type TNodeId = string;
export type TAddr = string;
export type TPath = string;
export type TSourceAddr = TAddr;
export type TTargetAddr = TAddr;
export type TSubscriberAddr = TAddr;
export type TSourcePath = TPath;
export type TTargetPath = TPath;
export type TEventName = string;
export type TCallbackId = string;
export type TMaybePromise<T = void> = Promise<T> | T;
export type TCallback = (api: IEventApi) => TMaybePromise<unknown>;
export type TUnsub = () => void;

export interface IPath {
	isAbsolute: boolean;
	segments: Array<string>;
}

// how to reach a sub target: its absolute address, and optionally the path back
// to it (the returnPath captured when the sub was installed). a path preserves
// relative routing; addr alone always means route via root.
export interface IRouteInfo {
	addr: TTargetAddr;
	path?: TTargetPath;
}

// per-traversal routing metadata. passed as a route() argument, never on the
// event, since fan-out clones it per branch and a shared event would let sibling
// branches clobber each other's cursor. cursor is the index of the next path
// segment to consume during a relative walk. returnPath is the path back to the
// source, built one hop at a time: prepend this node's id when stepping to the
// parent, prepend .. when stepping into a child.
export interface IRouteState {
	isAbsolute: boolean;
	hasWildcard: boolean;
	haveAncestor: boolean;
	cursor: number;
	returnPath: TSourcePath;
}

export interface IEvent {
	name: TEventName;
	payload?: unknown;
	targetPath: TTargetPath;
	targetAddr?: TTargetAddr;
	sourceAddr: TSourceAddr;
	expectResponse: boolean;
	isParallel: boolean;
	seed?: unknown;
	result?: unknown;
}

// the per-delivery handle passed to a callback. holds the event, the immutable
// payload and seed, the running result, and the returnPath captured during
// routing (the path back to the event's source, used by sys.sub to learn how to
// reach a subscriber). handlers read result and set a new one.
export interface IEventApi {
	readonly event: IEvent;
	readonly payload: unknown;
	readonly seed: unknown;
	readonly returnPath: TSourcePath;
	result: unknown;
	// advance into the rest of the sequential chain and return its result, so a
	// handler can post-process downstream output. no-op returning the current
	// result outside sequential dispatch.
	next: () => Promise<unknown>;
}

// the narrow, relay-safe surface a node exposes across the boundary, parent or
// child, local or remote. a RemoteNode forwards each of these over the wire, so
// every method may be async.
export interface IExternalNode {
	readonly nodeId: TNodeId;
	readonly nodeAddr: TAddr;
	addParent(parent: IExternalNode): TMaybePromise<void>;
	removeParent(): TMaybePromise<void>;
	route(ev: IEvent, rs?: IRouteState): TMaybePromise<unknown>;
}

// constants

const SEP = "/";
const UP = "..";
const SELF = ".";
const STAR = "*";
const STARSTAR = "**";

const SYS_CARRY = "sys.carry";
const SYS_SUB = "sys.sub";
const SYS_UNSUB = "sys.unsub";

// path fns

export function parsePath(raw: string): IPath {
	const isAbsolute = raw.startsWith(SEP);
	const body = isAbsolute ? raw.slice(SEP.length) : raw;
	const segments = body.split(SEP).filter((s) => s.length > 0 && s !== SELF);
	return {
		isAbsolute,
		segments,
	};
}

function addrSegments(addr: TAddr): Array<string> {
	return addr.split(SEP).filter((s) => s.length > 0);
}

function joinAddr(segments: Array<string>): TAddr {
	return SEP + segments.join(SEP);
}

// prepend one segment to a relative path being built back toward the source.
function prependSeg(seg: string, path: TSourcePath): TSourcePath {
	return path.length === 0 ? seg : seg + SEP + path;
}

// walk the given path from the source to get the target's absolute address.
// wildcard segments stay literal in the result, since they resolve to many
// nodes. .. is only valid before the first wildcard, as upward repositioning of
// the base; a .. after a wildcard has no single resolution and throws.
export function computeTargetAddr(sourceAddr: TSourceAddr, path: IPath): TTargetAddr {
	if (path.isAbsolute) return joinAddr(path.segments);
	const stack = addrSegments(sourceAddr);
	let seenWildcard = false;
	for (const seg of path.segments) {
		if (seg === STAR || seg === STARSTAR) {
			seenWildcard = true;
			stack.push(seg);
		}
		else if (seg === UP) {
			if (seenWildcard) throw new Error("'..' after a wildcard segment is undefined");
			if (stack.length === 0) throw new Error("path walks above root");
			stack.pop();
		}
		else stack.push(seg);
	}
	return joinAddr(stack);
}

export function hasWildcard(addr: TAddr): boolean {
	return addr.indexOf(STAR) >= 0;
}

// glob match of a concrete address against a pattern. * matches exactly one
// segment, ** matches zero or more, both usable mid-path (a/*/b, a/**/b).
export function matchAddr(pattern: TAddr, concrete: TAddr): boolean {
	return matchSegs(addrSegments(pattern), addrSegments(concrete));
}

function matchSegs(pat: Array<string>, seg: Array<string>): boolean {
	let pi = 0;
	let si = 0;
	// star indices remembered for ** backtracking
	let starPi = -1;
	let starSi = -1;
	while (si < seg.length) {
		if (pi < pat.length && pat[pi] === STARSTAR) {
			starPi = pi;
			starSi = si;
			pi += 1;
		}
		else if (pi < pat.length && (pat[pi] === STAR || pat[pi] === seg[si])) {
			pi += 1;
			si += 1;
		}
		else if (starPi >= 0) {
			pi = starPi + 1;
			starSi += 1;
			si = starSi;
		}
		else return false;
	}
	while (pi < pat.length && pat[pi] === STARSTAR) pi += 1;
	return pi === pat.length;
}

// node

export class EventNode implements IExternalNode {
	public readonly nodeId: TNodeId;
	public nodeAddr: TAddr;
	public isRoot: boolean;
	public parent: IExternalNode | null;
	public children: Record<TNodeId, IExternalNode>;

	public callbacks: Record<TCallbackId, TCallback>;
	public listeners: Record<TSourceAddr, Record<TEventName, Set<TCallbackId>>>;
	// reverse lookup so a listener can be removed by its id alone, in O(1),
	// without scanning the nested listeners map. subs install relay listeners
	// keyed by a shared id, and unsub removes them through this.
	public mapCallbackToListener: Record<TCallbackId, { source: TSourceAddr; name: TEventName }>;
	// relay listener ids grouped by the subscriber they forward to, so all relays
	// for a dropped subscriber can be purged in O(1).
	public mapSubscriberToIds: Record<TSubscriberAddr, Set<TCallbackId>>;

	constructor(nodeId: TNodeId, isRoot: boolean) {
		this.nodeId = nodeId;
		this.isRoot = isRoot;
		this.nodeAddr = isRoot ? SEP + nodeId : "";
		this.parent = null;
		this.children = {};
		this.callbacks = {};
		this.listeners = {};
		this.mapCallbackToListener = {};
		this.mapSubscriberToIds = {};
		this.setupInternalEvents();
	}

	// tree: attach is parent-initiated. this node records the child, then asks
	// the child to set its own parent. the child owns its parent and addr on its
	// own side, which keeps it safe and relayable for a remote child.

	public async addChild(node: IExternalNode): Promise<void> {
		if (this.children[node.nodeId]) throw new Error("child id already exists: " + node.nodeId);
		this.children[node.nodeId] = node;
		await node.addParent(this);
	}

	public async removeChild(nodeId: TNodeId): Promise<void> {
		const node = this.children[nodeId];
		if (!node) return;
		delete this.children[nodeId];
		await node.removeParent();
	}

	public async addParent(parent: IExternalNode): Promise<void> {
		this.parent = parent;
		this.nodeAddr = parent.nodeAddr + SEP + this.nodeId;
		for (const id in this.children) await this.children[id].addParent(this);
	}

	public async removeParent(): Promise<void> {
		this.parent = null;
		this.nodeAddr = "";
	}

	// callbacks

	public addCallback(cb: TCallback): TCallbackId {
		const cbId = nanoid(8);
		this.callbacks[cbId] = cb;
		return cbId;
	}

	public removeCallback(cbId: TCallbackId): void {
		delete this.callbacks[cbId];
	}

	// install a local callback for an event from a source pattern. the pattern
	// may be relative and is resolved to an absolute address at install time. it
	// may contain * or ** segments, matched against the event's sourceAddr. an id
	// may be supplied so both ends of a sub share one handle; it is returned so a
	// local caller can unsub. the reverse map records where the callback lives so
	// it can be removed by id alone.

	public listen(name: TEventName, source: TSourcePath, cb: TCallback, id?: TCallbackId): TCallbackId {
		const sourceAddr = computeTargetAddr(this.nodeAddr, parsePath(source));
		const cbId = id || nanoid(8);
		this.callbacks[cbId] = cb;
		this.mapCallbackToListener[cbId] = { source: sourceAddr, name };
		if (!this.listeners[sourceAddr]) this.listeners[sourceAddr] = {};
		if (!this.listeners[sourceAddr][name]) this.listeners[sourceAddr][name] = new Set();
		this.listeners[sourceAddr][name].add(cbId);
		return cbId;
	}

	// remove a listener by its id, in O(1), via the reverse map.

	public removeListener(cbId: TCallbackId): void {
		const loc = this.mapCallbackToListener[cbId];
		if (!loc) return;
		const byName = this.listeners[loc.source];
		if (byName && byName[loc.name]) byName[loc.name].delete(cbId);
		delete this.mapCallbackToListener[cbId];
		this.removeCallback(cbId);
	}

	// emit an event from this node toward a target path. resolves the concrete
	// target addr when there is no wildcard, stamps this node as the source, and
	// routes. returns the routed result.

	public pub(targetPath: TTargetPath, name: TEventName, payload?: unknown, opts?: { expectResponse?: boolean; isParallel?: boolean; seed?: unknown }): TMaybePromise<unknown> {
		const path = parsePath(targetPath);
		const wild = hasWildcard(targetPath);
		const ev: IEvent = {
			name,
			payload,
			targetPath,
			targetAddr: wild ? undefined : computeTargetAddr(this.nodeAddr, path),
			sourceAddr: this.nodeAddr,
			expectResponse: !!(opts && opts.expectResponse),
			isParallel: !!(opts && opts.isParallel),
			seed: opts ? opts.seed : undefined,
		};
		return this.route(ev);
	}

	// subscribe to an event emitted by a target node. a shared id keys the local
	// callback here and a relay listener on the target. the local listener is
	// gated to the target as its source, so events the target relays back match.
	// sys.sub carries the id; the target installs the relay (see setupInternalEvents).

	public async sub(targetPath: TTargetPath, name: TEventName, cb: TCallback): Promise<TCallbackId> {
		const id = nanoid(8);
		// subscribing to self is just a local listener: the event already fires
		// here, so no relay round-trip is needed.
		const targetAddr = hasWildcard(targetPath) ? undefined : computeTargetAddr(this.nodeAddr, parsePath(targetPath));
		if (targetAddr === this.nodeAddr) {
			this.listen(name, SELF, cb, id);
			return id;
		}
		this.listen(name, targetPath, cb, id);
		await this.route(this.wrapEvent(targetPath, SYS_SUB, { name, id }));
		return id;
	}

	// undo a sub by its shared id: remove the local listener and tell the target
	// to remove its relay listener of the same id.

	public async unsub(targetPath: TTargetPath, id: TCallbackId): Promise<void> {
		this.removeListener(id);
		await this.route(this.wrapEvent(targetPath, SYS_UNSUB, { id }));
	}

	// drop every relay listener that forwards to a given subscriber, in O(1).
	// used when a subscriber disconnects.

	public purgeSubscriber(subscriber: TSubscriberAddr): void {
		const ids = this.mapSubscriberToIds[subscriber];
		if (!ids) return;
		for (const id of ids) this.removeListener(id);
		delete this.mapSubscriberToIds[subscriber];
	}

	// emit wrappers over pub. broadcast fans out in parallel and ignores returns;
	// pipe runs a single sequential waterfall and returns the threaded result;
	// survey fans out in parallel and collects every handler's return. target
	// defaults to self.

	public broadcast(name: TEventName, payload?: unknown, targetPath: TTargetPath = SELF): TMaybePromise<unknown> {
		return this.pub(targetPath, name, payload, { isParallel: true, expectResponse: false });
	}

	public pipe(name: TEventName, payload?: unknown, targetPath: TTargetPath = SELF, seed?: unknown): TMaybePromise<unknown> {
		return this.pub(targetPath, name, payload, { isParallel: false, expectResponse: true, seed });
	}

	public survey(name: TEventName, payload?: unknown, targetPath: TTargetPath = SELF): TMaybePromise<unknown> {
		return this.pub(targetPath, name, payload, { isParallel: true, expectResponse: true });
	}

	// listen wrappers over sub. on is for events with no expected return: it runs
	// the callback, discards its value, and warns if one was returned. hook is for
	// returning events: it passes the value through, and warns if none came back.
	// both install the same relay sub; only the value handling and warning differ.

	public on(targetPath: TTargetPath, name: TEventName, cb: TCallback): Promise<TCallbackId> {
		return this.sub(targetPath, name, async (api) => {
			const out = await cb(api);
			if (out !== undefined) console.warn("on(): handler returned a value for a no-return event:", name);
		});
	}

	public hook(targetPath: TTargetPath, name: TEventName, cb: TCallback): Promise<TCallbackId> {
		return this.sub(targetPath, name, async (api) => {
			const out = await cb(api);
			if (out === undefined) console.warn("hook(): handler returned no value for a return event:", name);
			return out;
		});
	}

	// fn declares a handler for events invoked at this node (a hook on self).
	// invoke calls such a handler at a target (a pipe at the target).

	public fn(name: TEventName, cb: TCallback): TCallbackId {
		return this.listen(name, SEP + STARSTAR, async (api) => {
			const out = await cb(api);
			if (out === undefined) console.warn("fn(): handler returned no value for an invoked event:", name);
			return out;
		});
	}

	public invoke(targetPath: TTargetPath, name: TEventName, payload?: unknown, seed?: unknown): TMaybePromise<unknown> {
		return this.pipe(name, payload, targetPath, seed);
	}

	// install the default internal event handlers as ordinary listeners from any
	// source.

	private setupInternalEvents(): void {
		this.listen(SYS_CARRY, STARSTAR, (api) => this.handleUnwrap(api));
		this.listen(SYS_SUB, STARSTAR, (api) => this.handleSub(api));
		this.listen(SYS_UNSUB, STARSTAR, (api) => this.handleUnsub(api));
	}

	// sys.carry: unwrap the inner event and route it at this node as the source,
	// so consume fans it to local listeners and relay listeners alike.
	private handleUnwrap(api: IEventApi): TMaybePromise<unknown> {
		const inner = api.payload as IEvent;
		const ev: IEvent = { ...inner, sourceAddr: this.nodeAddr, targetPath: this.nodeAddr, targetAddr: this.nodeAddr };
		return this.route(ev);
	}

	// sys.sub: install a relay listener whose callback forwards the event back to
	// the subscriber along the returnPath captured when this sub request arrived.
	private handleSub(api: IEventApi): void {
		const p = api.payload as { name: TEventName; id: TCallbackId };
		const subscriber = api.event.sourceAddr;
		const backPath = api.returnPath;
		this.listen(p.name, SELF, (relayApi) => {
			const back = parsePath(backPath);
			const fwd: IEvent = {
				...relayApi.event,
				targetPath: backPath,
				targetAddr: hasWildcard(backPath) ? undefined : computeTargetAddr(this.nodeAddr, back),
			};
			return this.route(fwd);
		}, p.id);
		if (!this.mapSubscriberToIds[subscriber]) this.mapSubscriberToIds[subscriber] = new Set();
		this.mapSubscriberToIds[subscriber].add(p.id);
	}

	// sys.unsub: remove the relay listener by its shared id.
	private handleUnsub(api: IEventApi): void {
		const p = api.payload as { id: TCallbackId };
		this.removeListener(p.id);
	}

	// build a carrier event addressed to a target path.
	private wrapEvent(targetPath: TTargetPath, name: TEventName, payload: unknown): IEvent {
		const wild = hasWildcard(targetPath);
		return {
			name,
			payload,
			targetPath,
			targetAddr: wild ? undefined : computeTargetAddr(this.nodeAddr, parsePath(targetPath)),
			sourceAddr: this.nodeAddr,
			expectResponse: false,
			isParallel: false,
		};
	}

	// the single traversal primitive. routing metadata rs is created on the first
	// call from the path form, then threaded and cloned per branch so fan-out
	// siblings never share a cursor. three traversal kinds:
	// - concrete (no wildcard): absolute ascends to the targetAddr common ancestor
	//   then walks down; relative walks straight toward targetAddr.
	// - absolute wildcard: ascend to root, then fan down matching addrs by glob.
	// - relative wildcard: walk the path literally from here by a segment cursor,
	//   .. up, a name into that child, * fanning every child, ** matching here or
	//   descending while staying on the same segment.
	// downward results combine: void when no response, concat parallel, threaded sequential.

	public async route(ev: IEvent, rs?: IRouteState): Promise<unknown> {
		let r = rs;
		if (!r) {
			const path = parsePath(ev.targetPath);
			r = { isAbsolute: path.isAbsolute, hasWildcard: hasWildcard(ev.targetPath), haveAncestor: false, cursor: 0, returnPath: "" };
		}
		const here = addrSegments(this.nodeAddr);

		// absolute, still ascending to the pivot. stepping to the parent prepends
		// this node's id to the returnPath (the way back descends into it).
		if (r.isAbsolute && !r.haveAncestor) {
			const target = addrSegments(ev.targetAddr || "");
			const isAncestorOfTarget = !r.hasWildcard
				&& here.length <= target.length
				&& here.every((seg, i) => seg === target[i]);
			const pivot = r.hasWildcard ? this.isRoot : isAncestorOfTarget;
			if (pivot) return this.route(ev, { ...r, haveAncestor: true });
			if (!this.parent) throw new Error("route reached a detached non-root node");
			return this.parent.route(ev, { ...r, returnPath: prependSeg(this.nodeId, r.returnPath) });
		}

		// concrete downward / toward-target walk (absolute past pivot, or relative).
		if (!r.hasWildcard) {
			if (this.nodeAddr === ev.targetAddr) return this.consume(ev, r);
			const target = addrSegments(ev.targetAddr || "");
			const onPath = here.length < target.length && here.every((seg, i) => seg === target[i]);
			if (onPath) {
				const childId = target[here.length];
				const child = this.children[childId];
				if (!child) throw new Error("route missing child: " + childId);
				return child.route(ev, { ...r, returnPath: prependSeg(UP, r.returnPath) });
			}
			if (!this.parent) throw new Error("route reached a detached non-root node");
			return this.parent.route(ev, { ...r, returnPath: prependSeg(this.nodeId, r.returnPath) });
		}

		// from here on: wildcard fan-out. work out whether this node consumes, and
		// how each child is recursed (carrying a cloned, possibly advanced cursor).
		let matched: boolean;
		let nextCursor: number;
		const segs = parsePath(ev.targetPath).segments;

		if (r.isAbsolute) {
			matched = this.nodeAddr.length > 0 && matchAddr(ev.targetPath, this.nodeAddr);
			nextCursor = r.cursor;
		}
		else if (r.cursor >= segs.length) {
			return this.consume(ev, r);
		}
		else {
			const seg = segs[r.cursor];
			if (seg === UP) {
				if (!this.parent) throw new Error("relative route walks above root");
				return this.parent.route(ev, { ...r, cursor: r.cursor + 1, returnPath: prependSeg(this.nodeId, r.returnPath) });
			}
			if (seg === STARSTAR) {
				matched = r.cursor + 1 >= segs.length;
				nextCursor = r.cursor;
			}
			else if (seg === STAR) {
				matched = false;
				nextCursor = r.cursor + 1;
			}
			else {
				const child = this.children[seg];
				if (!child) return ev.expectResponse ? (ev.isParallel ? [] : currentResult(ev)) : undefined;
				return child.route(ev, { ...r, cursor: r.cursor + 1, returnPath: prependSeg(UP, r.returnPath) });
			}
		}

		// fan down into children, combining per response mode. descending into a
		// child prepends .. to that branch's returnPath.
		const childReturn = prependSeg(UP, r.returnPath);
		if (!ev.expectResponse) {
			if (matched) this.consume(ev, r);
			for (const id in this.children) this.children[id].route(ev, { ...r, cursor: nextCursor, returnPath: childReturn });
			return;
		}

		if (ev.isParallel) {
			const pending: Array<Promise<unknown>> = [];
			if (matched) pending.push(Promise.resolve(this.consume(ev, r)));
			for (const id in this.children) pending.push(Promise.resolve(this.children[id].route(ev, { ...r, cursor: nextCursor, returnPath: childReturn })));
			const settled = await Promise.all(pending);
			const out: Array<unknown> = [];
			for (const part of settled) {
				if (Array.isArray(part)) for (const item of part) out.push(item);
				else if (part !== undefined) out.push(part);
			}
			return out;
		}

		if (matched) ev.result = await this.consume(ev, r);
		for (const id in this.children) ev.result = await this.children[id].route(ev, { ...r, cursor: nextCursor, returnPath: childReturn });
		return ev.result;
	}

	// delivery at the target: fire local callbacks whose installed source pattern
	// matches the event's sourceAddr. exact entries are matched by direct lookup,
	// wildcard entries by glob. name-only matches do not fire.
	// !expectResponse: fire all, do not await, return void (fire-and-forget).
	// isParallel: await all, flatten handler returns into a results array.
	// sequential: thread one result through handlers in order, seeded by ev.seed.

	public async consume(ev: IEvent, rs?: IRouteState): Promise<unknown> {
		const ids = this.matchListeners(ev);
		const returnPath = rs ? rs.returnPath : "";

		if (!ev.expectResponse) {
			for (const cbId of ids) {
				const cb = this.callbacks[cbId];
				if (cb) cb(this.makeApi(ev, ev.seed, returnPath));
			}
			return;
		}

		if (ids.length === 0) return ev.isParallel ? [] : currentResult(ev);

		if (ev.isParallel) {
			const out: Array<unknown> = [];
			const pending: Array<Promise<void>> = [];
			for (const cbId of ids) {
				const cb = this.callbacks[cbId];
				if (cb) pending.push(Promise.resolve(cb(this.makeApi(ev, ev.seed, returnPath))).then((r) => { out.push(r); }));
			}
			return Promise.all(pending).then(() => out);
		}

		// sequential waterfall with next(). a pointer advances through the matched
		// handlers. each handler may call api.next() to run the rest of the chain and
		// post-process its result; if it does not, the framework advances for it.
		// a handler returning undefined leaves the running result unchanged.
		let i = 0;
		let result = currentResult(ev);
		const runNext = async (): Promise<unknown> => {
			if (i >= ids.length) return result;
			const cbId = ids[i];
			i += 1;
			const cb = this.callbacks[cbId];
			if (!cb) return runNext();
			let calledNext = false;
			const api = this.makeApi(ev, result, returnPath, async () => {
				calledNext = true;
				result = await runNext();
				return result;
			});
			const out = await cb(api);
			if (out !== undefined) result = out;
			// if the handler drove the chain itself, do not advance again.
			if (!calledNext) return runNext();
			return result;
		};
		return runNext();
	}

	// match installed listener patterns against the event. exact source addrs are
	// a direct lookup, wildcard patterns are scanned and glob-matched.

	private matchListeners(ev: IEvent): Array<TCallbackId> {
		const out: Array<TCallbackId> = [];
		const exact = this.listeners[ev.sourceAddr];
		if (exact && exact[ev.name]) for (const id of exact[ev.name]) out.push(id);
		for (const pattern in this.listeners) {
			if (pattern === ev.sourceAddr) continue;
			if (!hasWildcard(pattern)) continue;
			const byName = this.listeners[pattern];
			if (!byName[ev.name]) continue;
			if (matchAddr(pattern, ev.sourceAddr)) for (const id of byName[ev.name]) out.push(id);
		}
		return out;
	}

	private makeApi(ev: IEvent, result: unknown, returnPath: TSourcePath, next?: () => Promise<unknown>): IEventApi {
		return {
			event: ev,
			payload: ev.payload,
			seed: ev.seed,
			returnPath,
			result,
			next: next || (async () => result),
		};
	}
}

// the running result an event currently carries: its threaded result if set,
// otherwise the seed it began with.
function currentResult(ev: IEvent): unknown {
	return ev.result !== undefined ? ev.result : ev.seed;
}