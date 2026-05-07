import { Box, Text, HStack, Flex } from '@chakra-ui/react';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { VscLayoutSidebarLeft, VscLayoutSidebarLeftOff } from 'react-icons/vsc';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useDependantState } from '../hooks/useDependantState';
import { updateSettings } from '../api/services';
import { useStore } from '../store';
import { useTauriWindow } from '@/hooks/useTauriWindow';
import { RiMenuFold4Line } from "react-icons/ri";
import { RiMenuFold3Line } from "react-icons/ri";

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
			color="var(--wc-text-header-muted)"
			border="none"
			outline="none"
			borderRadius={"md"}
			_hover={{
				bg: isClose ? 'var(--wc-text-header-close-bg)' : 'var(--wc-text-header-hover-bg)',
				color: isClose ? 'var(--wc-text-header-close)' : 'var(--wc-text-header-hover)',
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

export const PageHeader = React.memo(({ title, subtitle, icon, actions, actionsRight }: IPageHeaderProps) => {
	const isCollapsedSetting = useStore(s => s.settings.sidebarCollapsed);
	const [collapsed, setCollapsed] = useDependantState(isCollapsedSetting);

	const handleCollapseChange = useCallback((newCollapsed: boolean) => {
		setCollapsed(newCollapsed);
		updateSettings({ sidebarCollapsed: newCollapsed });
	}, []);

	const {
		isTauri,
		isMaximized,

		handleDoubleClick,
		handleMinimize,
		handleMaximize,
		handleClose,
	} = useTauriWindow();

	return (
		<Flex
			position={"absolute"}
			top="0px"
			left={ collapsed ? "60px" : "220px" }
			zIndex={"99"}
			justify="space-between"
			align="center"
			px="4"
			height="60px"
			right={"0px"}
			boxSizing={"border-box"}
			borderBottomWidth="1px"
			borderColor="var(--wc-border-header)"
			bg="var(--wc-bg-header)"
			boxShadow={"4px 0px 10px rgba(0,0,0,0.2)"}
			className='drag'
			onDoubleClick={handleDoubleClick}
			style={{ userSelect: 'none', WebkitUserSelect: 'none', userDrag: 'none',
				backdropFilter: "blur(10px)",
				WebkitBackdropFilter: "blur(10px)",
			 }}
			// boxShadow={"0px 0px 10px #050505"}
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
					color="var(--wc-text-header-toggle)"
					_hover={{ color: 'var(--wc-text-header-hover)', bg: 'var(--wc-text-header-hover-bg)' }}
					transition="all 0.15s ease"
					onClick={() => handleCollapseChange(!collapsed)}
					flexShrink={0}
					ml="-2"
					className='no-drag'
				>
					{collapsed ? <RiMenuFold4Line size={20} /> : <RiMenuFold3Line size={20} />}
				</Flex>
				<Box mr="1" ml="-1">
					<Text fontSize="14px" fontWeight="500" letterSpacing="-0.02em" color="var(--wc-text-header-title)">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="12px" color="var(--wc-text-header-subtitle)">
							{subtitle}
						</Text>
					)}
				</Box>
				{actions && <HStack gap="2" pl="5" borderLeft={`1px solid var(--wc-border-header)`} className='no-drag'>{actions}</HStack>}
			</HStack>
			<HStack gap="4" alignItems="center">
				{actionsRight && <HStack gap="2" className='no-drag'>{actionsRight}</HStack>}
				{isTauri && <HStack gap="0" mr="-2" borderLeft={`1px solid var(--wc-border-header)`} ml="2" pl="2" className='no-drag'>
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
});
