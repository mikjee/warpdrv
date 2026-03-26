import { useState, useEffect } from 'react';
import { Flex, Text, HStack, Box } from '@chakra-ui/react';
import { Minus, Square, X, Copy } from 'lucide-react';

// Only true when running inside Tauri webview
const isTauri = !!(window as any).__TAURI_INTERNALS__;

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
			onClick={onClick}
		>
			{children}
		</Flex>
	);
}

export function TitleBar() {
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (!isTauri) return;

		let unlisten: (() => void) | undefined;

		(async () => {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			const win = getCurrentWindow();

			// Check initial state
			setIsMaximized(await win.isMaximized());

			// Listen for resize events to track maximize state
			unlisten = await win.onResized(async () => {
				setIsMaximized(await win.isMaximized());
			});
		})();

		return () => {
			if (unlisten) unlisten();
		};
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
			bg="#09090b"
			align="center"
			justify="space-between"
			borderBottomWidth="1px"
			borderColor="rgba(255, 255, 255, 0.06)"
			// @ts-ignore — Tauri v2 recognizes this attribute for window dragging
			data-tauri-drag-region=""
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
				WarpCore
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