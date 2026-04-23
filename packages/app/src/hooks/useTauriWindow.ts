import { useCallback, useEffect, useRef, useState } from 'react';

// ---


export const useTauriWindow = () => {
	
	const isTauri = !!(window as any).__TAURI_INTERNALS__;
	const DRAG_THRESHOLD = 4;

	// ---
	
	const [isMaximized, setIsMaximized] = useState(false);
	const dragOrigin = useRef<{ x: number; y: number } | null>(null);
	const isDragging = useRef(false);

	// ---

	const installHook = () => {
		useEffect(() => {
			if (!isTauri) return;

			let cancelled = false;
			let unlisten: (() => void) | undefined;

			(async () => {
				const { getCurrentWindow } = await import('@tauri-apps/api/window');
				const win = getCurrentWindow();

				setIsMaximized(await win.isMaximized());

				unlisten = await win.onResized(async () => {
					if (cancelled) return;
					setIsMaximized(await win.isMaximized());
				});
			})();

			return () => {
				cancelled = true;
				if (unlisten) unlisten();
			};
		}, []);

		useEffect(() => {

			const handleMouseDown = (e: MouseEvent) => {
				if (e.button !== 0) return;
				const target = e.target as HTMLElement;

				if (target.closest('.no-drag')) {
					return;
				};
				
				if (!target.closest('.drag')) {
					return;
				};

				dragOrigin.current = { x: e.clientX, y: e.clientY };
				isDragging.current = false;
			};

			const handleMouseMove = async (e: MouseEvent) => {
				if (!isTauri) return;
				if (!dragOrigin.current || isDragging.current) return;

				const dx = Math.abs(e.clientX - dragOrigin.current.x);
				const dy = Math.abs(e.clientY - dragOrigin.current.y);

				if (dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD) {
					isDragging.current = true;
					const { getCurrentWindow } = await import('@tauri-apps/api/window');
					getCurrentWindow().startDragging().catch((err) => console.error(err));
				}
			};

			const handleMouseUp = () => {
				dragOrigin.current = null;
				isDragging.current = false;
			};

			window.addEventListener('mousedown', handleMouseDown);
			window.addEventListener('mousemove', handleMouseMove);
			window.addEventListener('mouseup', handleMouseUp);

			return () => {
				window.removeEventListener('mousemove', handleMouseMove);
				window.removeEventListener('mouseup', handleMouseUp);
				window.removeEventListener('mousedown', handleMouseDown);
			};
		}, []);
	};

	// ---

	const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
		if (!isTauri) return;
		const target = e.target as HTMLElement;
		if (target.closest('.no-drag')) return;

		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	}, []);

	const handleMinimize = useCallback(async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().minimize();
	}, []);

	const handleMaximize = useCallback(async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	}, []);

	const handleClose = useCallback(async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().hide();
	}, []);

	// ---

	return {
		isTauri,
		isMaximized,
		isDragging,

		installHook,

		handleDoubleClick,
		handleMinimize,
		handleMaximize,
		handleClose,
	};

}