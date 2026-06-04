import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export enum HotkeyMode {
	KEYPRESS = "KEYPRESS",
	HOLD = "HOLD",
	TOGGLE = "TOGGLE",
}

export type KeyRecord = Record<string, true>;

export function comboStringToRecord(s: string): KeyRecord {
	if (!s) return {};
	return s.split('|').reduce((acc, code) => {
		acc[code] = true;
		return acc;
	}, {} as KeyRecord);
}

export function recordToComboString(record: KeyRecord): string {
	return Object.keys(record).join('|');
}

// shared module-level pressed-key state (Record, not Set)
export const pressedKeys: Record<string, true> = {};
const subscribers: Array<() => void> = [];

function notify(): void {
	for (let i = 0; i < subscribers.length; i++) {
		subscribers[i]();
	}
}

function subscribe(fn: () => void): () => void {
	subscribers.push(fn);
	return () => {
		const idx = subscribers.indexOf(fn);
		if (idx !== -1) subscribers.splice(idx, 1);
	};
}

function setKeyDown(code: string): void {
	if (pressedKeys[code]) return;
	pressedKeys[code] = true;
	notify();
}

function setKeyUp(code: string): void {
	if (!pressedKeys[code]) return;
	delete pressedKeys[code];
	notify();
}

// exact match: every combo key down AND no other key down
function isComboActive(keys: KeyRecord): boolean {
	const comboCodes = Object.keys(keys);
	const pressedCodes = Object.keys(pressedKeys);
	if (comboCodes.length !== pressedCodes.length) return false;
	for (let i = 0; i < comboCodes.length; i++) {
		if (!pressedKeys[comboCodes[i]]) return false;
	}
	return true;
}

// ---- global (rdev via Tauri) wiring ----
// no existing channel; this sets one up lazily on first global hook.
// expects backend to emit a "hotkey://key" event with payload { code, down }.
type IRdevPayload = { code: string; down: boolean };
let globalRefCount = 0;
let globalUnlisten: null | (() => void) = null;

async function startGlobal(): Promise<void> {
	globalRefCount++;
	if (globalRefCount > 1) return;
	const tauri = await import("@tauri-apps/api/event");
	const un = await tauri.listen<IRdevPayload>("hotkey://key", (e) => {
		const p = e.payload;
		if (p.down) setKeyDown(p.code);
		else setKeyUp(p.code);
	});
	globalUnlisten = un;
}

function stopGlobal(): void {
	globalRefCount--;
	if (globalRefCount > 0) return;
	if (globalUnlisten) {
		globalUnlisten();
		globalUnlisten = null;
	}
}

export function useHotkey(
	options: {
		keys: KeyRecord;
		mode: HotkeyMode;
		target: RefObject<EventTarget> | Window;
		isGlobal?: boolean;
		isEnabled?: boolean;
	},
	callbacks: {
		onActivate?: () => void;
		onDeactivate?: () => void;
	}
): { isActive: boolean } {
	const { keys, mode, target, isGlobal = false, isEnabled = true } = options;
	const [isActive, setIsActive] = useState(false);

	// keep latest values without re-binding listeners every render
	const keysRef = useRef(keys);
	const cbRef = useRef(callbacks);
	const wasMatchedRef = useRef(false);
	const activeRef = useRef(false);
	keysRef.current = keys;
	cbRef.current = callbacks;

	// DOM listeners for local mode
	useEffect(() => {
		if (!isEnabled || isGlobal) return;

		const el: EventTarget = target === window
			? window
			: (target as RefObject<EventTarget>).current ?? window;

		const onDown = (ev: Event) => setKeyDown((ev as KeyboardEvent).code);
		const onUp = (ev: Event) => setKeyUp((ev as KeyboardEvent).code);

		el.addEventListener("keydown", onDown, true);
		el.addEventListener("keyup", onUp, true);
		return () => {
			el.removeEventListener("keydown", onDown, true);
			el.removeEventListener("keyup", onUp, true);
		};
	}, [isEnabled, isGlobal, target]);

	// global listeners for rdev mode
	useEffect(() => {
		if (!isEnabled || !isGlobal) return;
		let live = true;
		startGlobal();
		return () => {
			if (live) stopGlobal();
			live = false;
		};
	}, [isEnabled, isGlobal]);

	// react to pressed-key changes
	useEffect(() => {
		if (!isEnabled) return;

		const evaluate = () => {
			const matched = isComboActive(keysRef.current);
			const wasMatched = wasMatchedRef.current;
			if (matched === wasMatched) return;
			wasMatchedRef.current = matched;

			if (mode === HotkeyMode.KEYPRESS) {
				if (matched) cbRef.current.onActivate?.();
				return;
			}

			if (mode === HotkeyMode.HOLD) {
				activeRef.current = matched;
				setIsActive(matched);
				if (matched) cbRef.current.onActivate?.();
				else cbRef.current.onDeactivate?.();
				return;
			}

			// TOGGLE: only flip on the press, ignore the release
			if (matched) {
				const next = !activeRef.current;
				activeRef.current = next;
				setIsActive(next);
				if (next) cbRef.current.onActivate?.();
				else cbRef.current.onDeactivate?.();
			}
		};

		evaluate();
		const unsub = subscribe(evaluate);
		return unsub;
	}, [isEnabled, mode]);

	return { isActive: mode === HotkeyMode.KEYPRESS ? false : isActive };
}