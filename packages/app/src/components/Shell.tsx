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
import { UpdateBanner } from './UpdateBanner';
import type { ReactNode } from 'react';

interface INavItem {
	path: string;
	label: string;
	icon: ReactNode;
}

const NAV_ITEMS: INavItem[] = [
	{ path: '/servers', label: 'Servers', icon: <Play size={18} /> },
	{ path: '/models', label: 'Models', icon: <FolderOpen size={18} /> },
	{ path: '/backends', label: 'Backends', icon: <Blocks size={18} /> },
	{ path: '/devices', label: 'Devices', icon: <Cpu size={18} /> },
	{ path: '/hub', label: 'Hub', icon: <Globe size={18} /> },
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
				px="3"
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
		<Flex h="100vh" overflow="hidden">
			{/* Sidebar */}
			<Flex
				direction="column"
				w="220px"
				minW="220px"
				bg="#0c0c0f"
				borderRightWidth="1px"
				borderColor="rgba(255, 255, 255, 0.06)"
				p="4"
				gap="1"
			>
				{/* Logo */}
				<HStack gap="2.5" px="2" py="3" mb="4">
					<Flex w="8" h="8" borderRadius="lg" overflow="hidden">
						<img src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
					</Flex>
					<Box>
						<Text
							fontSize="15px"
							fontWeight="700"
							letterSpacing="-0.02em"
							lineHeight="1.1"
							bgGradient="to-r"
							gradientFrom="#e4e4e7"
							gradientTo="rgba(255, 255, 255, 0.6)"
							bgClip="text"
						>
							WarpCore
						</Text>
						<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontWeight="500" letterSpacing="0.05em" textTransform="uppercase">
							v0.1.0
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
				<Box px="2" py="2" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.04)">
					<a
						href="https://www.github.com/mikjee"
						target="_blank"
						rel="noopener noreferrer"
						style={{ textDecoration: 'none' }}
					>
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.2)" _hover={{ color: 'rgba(255, 255, 255, 0.4)' }}>
							@mikjee
						</Text>
					</a>
				</Box>
			</Flex>

			{/* Main content */}
			<Box flex="1" overflow="auto" bg="#09090b">
				<UpdateBanner />
				<Outlet />
			</Box>
		</Flex>
	);
}
