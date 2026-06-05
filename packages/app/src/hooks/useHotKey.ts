import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export enum HotkeyMode {
	KEYPRESS = "KEYPRESS",
	HOLD = "HOLD",
	TOGGLE = "TOGGLE",
}

export type KeyRecord = Record<string, true>;
type IKeys = KeyRecord | Array<KeyRecord>;

export function comboStringToRecord(s: string): KeyRecord {
	if (!s) return {};
	return s.split("|").reduce((acc, code) => {
		acc[code] = true;
		return acc;
	}, {} as KeyRecord);
}

export function recordToComboString(record: KeyRecord): string {
	return Object.keys(record).join("|");
}

// exact match: every combo key down AND no other key down
function isComboActive(pressed: Record<string, true>, keys: KeyRecord): boolean {
	const comboCodes = Object.keys(keys);
	const pressedCodes = Object.keys(pressed);
	//console.log("match check", comboCodes, pressedCodes);
	if (comboCodes.length !== pressedCodes.length) return false;
	for (let i = 0; i < comboCodes.length; i++) {
		if (!pressed[comboCodes[i]]) return false;
	}
	return true;
}

function isAnyComboActive(pressed: Record<string, true>, keys: IKeys): boolean {
	const combos = Array.isArray(keys) ? keys : [keys];
	for (let i = 0; i < combos.length; i++) {
		if (isComboActive(pressed, combos[i])) return true;
	}
	return false;
}

type IRdevPayload = { code: string; down: boolean };

export function useHotkey(
	options: {
		keys: IKeys;
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

	// per-hook pressed-key state — populated only by this hook's own target listeners
	const pressedRef = useRef<Record<string, true>>({});
	// latest values for stable callbacks to read without re-binding listeners
	const keysRef = useRef(keys);
	const cbRef = useRef(callbacks);
	const modeRef = useRef(mode);
	const wasMatchedRef = useRef(false);
	const activeRef = useRef(false);
	keysRef.current = keys;
	cbRef.current = callbacks;
	modeRef.current = mode;

	const evaluate = useCallback((): void => {
		console.log('[hk]', JSON.stringify(pressedRef.current), 'm', isAnyComboActive(pressedRef.current, keysRef.current), 'was', wasMatchedRef.current);

		const matched = isAnyComboActive(pressedRef.current, keysRef.current);
		const wasMatched = wasMatchedRef.current;
		if (matched === wasMatched) return;
		wasMatchedRef.current = matched;

		const m = modeRef.current;
		if (m === HotkeyMode.KEYPRESS) {
			if (matched) {
				cbRef.current.onActivate?.();
				pressedRef.current = {};
				wasMatchedRef.current = false;
			}
			return;
		}
		if (m === HotkeyMode.HOLD) {
			activeRef.current = matched;
			setIsActive(matched);
			if (matched) cbRef.current.onActivate?.();
			else cbRef.current.onDeactivate?.();
			return;
		}
		// TOGGLE: flip on press, ignore release
		if (matched) {
			const next = !activeRef.current;
			activeRef.current = next;
			setIsActive(next);
			if (next) cbRef.current.onActivate?.();
			else cbRef.current.onDeactivate?.();
		}
	}, []);

	const keyDown = useCallback((code: string): void => {
		// console.log("[HOTKEY] KeyDown", code);
		if (pressedRef.current[code]) return;
		pressedRef.current[code] = true;
		evaluate();
	}, [evaluate]);

	const keyUp = useCallback((code: string): void => {
		// console.log("[HOTKEY] KeyUp", code);
		if (!pressedRef.current[code]) return;
		delete pressedRef.current[code];
		evaluate();
	}, [evaluate]);

	const clearKeys = useCallback((): void => {
		const codes = Object.keys(pressedRef.current);
		if (codes.length === 0) return;
		pressedRef.current = {};
		evaluate();
	}, [evaluate]);

	// DOM listeners for local mode
	useEffect(() => {
		if (!isEnabled || isGlobal) {
			clearKeys();
			return;
		}
		const el: EventTarget = target === window
			? window
			: (target as RefObject<EventTarget>).current ?? window;

		const onDown = (ev: Event) => keyDown((ev as KeyboardEvent).code);
		const onUp = (ev: Event) => keyUp((ev as KeyboardEvent).code);
		const onBlur = () => clearKeys();

		el.addEventListener("keydown", onDown, true);
		el.addEventListener("keyup", onUp, true);
		window.addEventListener("blur", onBlur);
		return () => {
			el.removeEventListener("keydown", onDown, true);
			el.removeEventListener("keyup", onUp, true);
			window.removeEventListener("blur", onBlur);
			clearKeys();
		};
	}, [isEnabled, isGlobal, target, keyDown, keyUp, clearKeys]);

	// global listeners (rdev via Tauri) for global mode
	useEffect(() => {
		if (!isEnabled || !isGlobal) {
			clearKeys();
			return;
		}
		let live = true;
		let unlisten: null | (() => void) = null;
		(async () => {
			const tauri = await import("@tauri-apps/api/event");
			const un = await tauri.listen<IRdevPayload>("hotkey://key", (e) => {
				const p = e.payload;
				if (p.down) keyDown(p.code);
				else keyUp(p.code);
			});
			if (live) unlisten = un;
			else un();
		})();
		return () => {
			live = false;
			if (unlisten) unlisten();
			clearKeys();
		};
	}, [isEnabled, isGlobal, keyDown, keyUp, clearKeys]);

	return { isActive: mode === HotkeyMode.KEYPRESS ? false : isActive };
}