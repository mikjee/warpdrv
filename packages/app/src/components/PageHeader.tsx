import { Box, Text, HStack, Flex } from '@chakra-ui/react';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from 'react-icons/vsc';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useDependantState } from '../hooks/useDependantState';
import { updateSettings } from '../api/services';
import { useStore } from '../store';

const isTauri = !!(window as any).__TAURI_INTERNALS__;
const DRAG_THRESHOLD = 4;

interface IPageHeaderProps {
	title: string;
	subtitle?: string;
	icon?: ReactNode;
	actions?: ReactNode;
	actionsRight?: ReactNode;
}

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

export function PageHeader({ title, subtitle, icon, actions, actionsRight }: IPageHeaderProps) {
	const settings = useStore(s => s.settings);
	const [collapsed, setCollapsed] = useDependantState(settings.sidebarCollapsed);
	const [isMaximized, setIsMaximized] = useState(false);
	const dragOrigin = useRef<{ x: number; y: number } | null>(null);
	const isDragging = useRef(false);

	const handleCollapseChange = useCallback((newCollapsed: boolean) => {
		setCollapsed(newCollapsed);
		updateSettings({ sidebarCollapsed: newCollapsed });
	}, []);

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

	const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
		const target = e.target as HTMLElement;
		if (target.closest('button')) return;

		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	}, []);

	const handleMinimize = async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().minimize();
	};

	const handleMaximize = async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().toggleMaximize();
	};

	const handleClose = async () => {
		if (!isTauri) return;
		const { getCurrentWindow } = await import('@tauri-apps/api/window');
		getCurrentWindow().hide();
	};

	return (
		<Flex
			position={"sticky"}
			top="0"
			zIndex={"99"}
			justify="space-between"
			align="center"
			px="4"
			py="2"
			borderBottomWidth="1px"
			borderColor="rgba(255, 255, 255, 0.06)"
			bg="#0c0c0c"
			onMouseDown={handleMouseDown}
			onDoubleClick={handleDoubleClick}
			style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
			boxShadow={"0px 0px 20px black"}
		>
			<HStack gap="4" ml="2">
				<Flex
					as="button"
					w="8"
					h="8"
					alignItems="center"
					justifyContent="center"
					borderRadius="md"
					cursor="pointer"
					color="rgba(255, 255, 255, 0.4)"
					_hover={{ color: 'rgba(255, 255, 255, 0.8)', bg: 'rgba(255, 255, 255, 0.08)' }}
					transition="all 0.15s ease"
					onClick={() => handleCollapseChange(!collapsed)}
					flexShrink={0}
					ml="-2"
				>
					{collapsed ? <VscLayoutSidebarLeftOff size={18} /> : <VscLayoutSidebarLeft size={18} />}
				</Flex>
				<Box mr="1" ml="-1">
					<Text fontSize="14px" fontWeight="500" letterSpacing="-0.02em" color="#7d7d7d">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">
							{subtitle}
						</Text>
					)}
				</Box>
				{actions && <HStack gap="2" pl="5" borderLeft={"1px solid rgb(30,30,30)"} >{actions}</HStack>}
			</HStack>
			<HStack gap="4" alignItems="center">
				{actionsRight && <HStack gap="2">{actionsRight}</HStack>}
				{isTauri && <HStack gap="0" mr="-2" borderLeft={"1px solid rgb(30,30,30)"} ml="2" pl="2">
					<WindowButton onClick={handleMinimize}>
						<Minus size={14} />
					</WindowButton>
					<WindowButton onClick={handleMaximize}>
						{isMaximized ? <Copy size={12} /> : <Square size={12} />}
					</WindowButton>
					<WindowButton onClick={handleClose} isClose>
						<X size={14} />
					</WindowButton>
				</HStack>}
			</HStack>
		</Flex>
	);
}
