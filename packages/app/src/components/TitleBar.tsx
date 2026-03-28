import { useState, useEffect, useRef, useCallback } from 'react';
import { Flex, Text, HStack } from '@chakra-ui/react';
import { Minus, Square, X, Copy } from 'lucide-react';

// Only true when running inside Tauri webview
const isTauri = !!(window as any).__TAURI_INTERNALS__;

// Minimum pixels of mouse movement before initiating window drag.
// Prevents startDragging from eating mouseup on simple clicks.
const DRAG_THRESHOLD = 4;

function WindowButton({ onClick, children, isClose }: {
	onClick: () => void;
	children: React.ReactNode;
	isClose?: boolean;
}) {
	return (
		<Flex
			as="button"
			align="center"
			justify="center"
			w="36px"
			h="36px"
			cursor="pointer"
			transition="background 0.1s ease"
			bg="transparent"
			color="rgba(255, 255, 255, 0.5)"
			border="none"
			outline="none"
			_hover={{
				bg: isClose ? 'rgba(255, 60, 60, 0.3)' : 'rgba(255, 255, 255, 0.08)',
				color: isClose ? '#ff6b6b' : 'rgba(255, 255, 255, 0.9)',
			}}
			onClick={(e) => {
				e.stopPropagation();
				e.preventDefault();
				onClick();
			}}
		>
			{children}
		</Flex>
	);
}

export function TitleBar() {
	const [isMaximized, setIsMaximized] = useState(false);
	const dragOrigin = useRef<{ x: number; y: number } | null>(null);
	const isDragging = useRef(false);

	useEffect(() => {
		if (!isTauri) return;

		let unlisten: (() => void) | undefined;

		(async () => {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();

			setIsMaximized(await win.isMaximized());

			unlisten = await win.onResized(async () => {
				setIsMaximized(await win.isMaximized());
			});
		})();

		return () => {
			if (unlisten) unlisten();
		};
	}, []);

	// Track mouse movement after mousedown to decide if this is a drag
	useEffect(() => {
		const handleMouseMove = async (e: MouseEvent) => {
			if (!dragOrigin.current || isDragging.current) return;

			const dx = Math.abs(e.clientX - dragOrigin.current.x);
			const dy = Math.abs(e.clientY - dragOrigin.current.y);

			if (dx >= DRAG_THRESHOLD || dy >= DRAG_THRESHOLD) {
				isDragging.current = true;
				const { getCurrentWindow } = await import('@tauri-apps/api/window');
				getCurrentWindow().startDragging();
			}
		};

		const handleMouseUp = () => {
			dragOrigin.current = null;
			isDragging.current = false;
		};

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		return () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
		};
	}, []);

	const handleMouseDown = useCallback((e: React.MouseEvent) => {
		if (e.button !== 0) return;
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;

		dragOrigin.current = { x: e.clientX, y: e.clientY };
		isDragging.current = false;
	}, []);

	// Double click to toggle maximize
	const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;

		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	}, []);

	if (!isTauri) return null;

	const handleMinimize = async () => {
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().minimize();
	};

	const handleMaximize = async () => {
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	};

	const handleClose = async () => {
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().hide();
	};

	return (
		<Flex
			h="36px"
			minH="36px"
			w="100%"
			bg="#0e0e0e"
			align="center"
			justify="space-between"
			borderBottomWidth="1px"
			borderColor="rgba(255, 255, 255, 0.06)"
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
		>
			{/* Title */}
			<Text
				fontSize="12px"
				fontWeight="500"
				color="rgba(255, 255, 255, 0.35)"
				pl="16px"
				letterSpacing="0.02em"
				pointerEvents="none"
			>
				warpcore
			</Text>

			{/* Window controls */}
			<HStack gap="0">
				<WindowButton onClick={handleMinimize}>
					<Minus size={14} />
				</WindowButton>
				<WindowButton onClick={handleMaximize}>
					{isMaximized ? <Copy size={12} /> : <Square size={12} />}
				</WindowButton>
				<WindowButton onClick={handleClose} isClose>
					<X size={14} />
				</WindowButton>
			</HStack>
		</Flex>
	);
}