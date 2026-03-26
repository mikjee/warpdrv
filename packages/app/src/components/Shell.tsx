import { Box, Flex, Text, VStack, HStack, Icon } from '@chakra-ui/react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
	Cpu,
	FolderOpen,
	Blocks,
	Play,
	Settings,
	Zap,
	Globe,
	Info,
} from 'lucide-react';
import { BsRouter } from "react-icons/bs";
import { UpdateBanner } from './UpdateBanner';
import { TitleBar } from './TitleBar';
import type { ReactNode } from 'react';

interface INavItem {
	path: string;
	label: string;
	icon: ReactNode;
}

const NAV_ITEMS: INavItem[] = [
	{ path: '/servers', label: 'Servers', icon: <Play size={18} /> },
	{ path: '/proxy', label: 'Router', icon: <BsRouter size={18} /> },
	{ path: '/models', label: 'Models', icon: <FolderOpen size={18} /> },
	{ path: '/backends', label: 'Backends', icon: <Blocks size={18} /> },
	{ path: '/devices', label: 'Devices', icon: <Cpu size={18} /> },
	{ path: '/hub', label: 'Hub', icon: <Globe size={18} /> },
];

const NAV_ITEMS_BOTTOM: INavItem[] = [
	{ path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
	{ path: '/about', label: 'About', icon: <Info size={18} /> },
];

function SidebarLink({ item }: { item: INavItem }) {
	const location = useLocation();
	const isActive = location.pathname === item.path;

	return (
		<NavLink to={item.path} style={{ textDecoration: 'none', width: '100%' }}>
			<HStack
				gap="3"
				px="4"
				py="2.5"
				borderRadius="lg"
				cursor="pointer"
				transition="all 0.15s ease"
				bg={isActive ? 'rgba(51, 129, 255, 0.1)' : 'transparent'}
				color={isActive ? '#3381ff' : 'rgba(255, 255, 255, 0.5)'}
				borderWidth="1px"
				borderColor={isActive ? 'rgba(51, 129, 255, 0.2)' : 'transparent'}
				_hover={{
					bg: isActive ? 'rgba(51, 129, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
					color: isActive ? '#3381ff' : 'rgba(255, 255, 255, 0.8)',
				}}
			>
				{item.icon}
				<Text fontSize="13px" fontWeight={isActive ? '600' : '400'}>
					{item.label}
				</Text>
			</HStack>
		</NavLink>
	);
}

export function Shell() {
	return (
		<Flex direction="column" h="100vh" overflow="hidden">
			<TitleBar />
			<Flex flex="1" overflow="hidden">
			{/* Sidebar */}
			<Flex
				direction="column"
				w="220px"
				minW="220px"
				// bg="#0c0c0f"
				borderRightWidth="1px"
				borderColor="rgba(255, 255, 255, 0.06)"
				p="4"
				gap="1"
			>
				{/* Logo */}
				<HStack gap="3" px="3" py="5" mb="5">
					<Flex w="12" h="12" borderRadius="lg" overflow="hidden" mr="3">
						<img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
					</Flex>
					<Box>
						<Text
							fontSize="16px"
							fontWeight="700"
							letterSpacing="-0.02em"
							lineHeight="1.1"
							bgGradient="to-r"
							gradientFrom="#e4e4e7"
							gradientTo="orange.500"
							bgClip="text"
						>
							warpcore &gt;&gt;
						</Text>
					</Box>
				</HStack>

				{/* Nav */}
				<VStack gap="1" align="stretch" flex="1">
					{NAV_ITEMS.map(item => (
						<SidebarLink key={item.path} item={item} />
					))}
				</VStack>

				{/* Footer */}
				<Box px="2" py="2">
					<VStack gap="1" align="stretch">
						{NAV_ITEMS_BOTTOM.map(item => (
							<SidebarLink key={item.path} item={item} />
						))}
					</VStack>
				</Box>
			</Flex>

			{/* Main content */}
			<Box flex="1" overflow="auto" bg="#09090b">
				<UpdateBanner />
				<Outlet />
			</Box>
			</Flex>
		</Flex>
	);
}

