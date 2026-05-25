import React from 'react';
import { useDependantState } from '../hooks/useDependantState';
import { Box, Flex, Text, VStack, HStack, Image } from '@chakra-ui/react';
import { NavLink, useLocation } from 'react-router-dom';
import {
	Cpu,
	FolderOpen,
	Blocks,
	Play,
	Settings,
	Globe,
	Info,
	Server,
	ScrollText,
	Home,
} from 'lucide-react';
import { BsRouter } from 'react-icons/bs';
import { MessageSquare, Save } from 'lucide-react';
import { UpdateBanner } from './UpdateBanner';
import { useSummary } from '../hooks/useSummary';
import { useStore } from '../store';
import type { ReactNode, ComponentType } from 'react';
import type { ISummaryData } from '../api/summary-services';
import { Plug } from 'lucide-react';

// Page imports for registry
import { HomePage } from '../pages/Home/HomePage';
import { AboutPage } from '../pages/About/AboutPage';
import { ModelsPage } from '../pages/Models/ModelsPage';
import { BackendsPage } from '../pages/Backends/BackendsPage';
import { ServersPage } from '@/pages/Servers/ServersPage';
import { HubPage } from '../pages/Hub/HubPage';
import { SettingsPage } from '../pages/Settings/SettingsPage';
import { ProxyPage } from '../pages/Proxy/ProxyPage';
import { ChatPage } from '../pages/Chat/ChatPage';
import { McpPage } from '../pages/MCP/McpPage';
import { RecipesPage } from '../pages/Recipes/RecipesPage';
import { CheckpointsPage } from '../pages/Checkpoints/CheckpointsPage';
import { useTauriWindow } from '@/hooks/useTauriWindow';

// Page lifecycle config: closeOnSwitch=false means page persists (hidden but not unmounted)
type TPageConfig = {
	component: ComponentType;
	closeOnSwitch: boolean;
};

const PAGE_REGISTRY: Record<string, TPageConfig> = {
	'/chat': { component: ChatPage, closeOnSwitch: false },
	'/home': { component: HomePage, closeOnSwitch: false },
	'/servers': { component: ServersPage, closeOnSwitch: false },
	'/proxy': { component: ProxyPage, closeOnSwitch: false },
	'/hub': { component: HubPage, closeOnSwitch: false },
	'/models': { component: ModelsPage, closeOnSwitch: false },
	'/backends': { component: BackendsPage, closeOnSwitch: false },
	'/settings': { component: SettingsPage, closeOnSwitch: true },
	'/about': { component: AboutPage, closeOnSwitch: true },
	'/mcp': { component: McpPage, closeOnSwitch: false },
	'/recipes': { component: RecipesPage, closeOnSwitch: false },
	'/checkpoints': { component: CheckpointsPage, closeOnSwitch: true },
};

interface INavItem {
	path?: string;
	label?: string;
	icon?: ReactNode;
	badge?: (summary: ISummaryData | null) => ReactNode;
	isSeparator?: boolean;
}

// Small count badge
function CountBadge({ count }: { count: number }) {
	if (count === 0) return null;
	return (
		<Flex
			alignItems="center"
			justifyContent="center"
			minW="18px"
			h="18px"
			px="1"
			borderRadius="full"
			bg="rgba(51, 129, 255, 0.15)"
			color="#3381ff"
			fontSize="10px"
			fontWeight="700"
			lineHeight="1"
			ml="auto"
			flexShrink={0}
		>
			{count}
		</Flex>
	);
}

// Green/red status dot with error state support
function StatusDot({ online, hasError }: { online: boolean; hasError?: boolean }) {
	if (hasError) {
		return (
			<Box
				w="5px"
				h="5px"
				borderRadius="full"
				bg="#ef4444"
				boxShadow="0 0 6px rgba(239, 68, 68, 0.6)"
				ml="auto"
				flexShrink={0}
			/>
		);
	}
	return (
		<Box
			w="5px"
			h="5px"
			borderRadius="full"
			bg={online ? '#22c55e' : 'transparent'}
			boxShadow={online ? '0 0 6px rgba(34, 197, 94, 0.5)' : 'none'}
			ml="auto"
			flexShrink={0}
		/>
	);
}

const NAV_ITEMS: INavItem[] = [
	{ path: '/home', label: 'Home', icon: <Home size={18} /> },
	{ isSeparator: true },
	{
		path: '/servers',
		label: 'Servers',
		icon: <Server size={18} />,
		badge: (s) => s ? <StatusDot online={s.servers.running > 0} hasError={s.servers.errors > 0} /> : null,
	},
	{
		path: '/proxy',
		label: 'Router',
		icon: <BsRouter size={18} />,
		badge: (s) => s ? <StatusDot online={s.router.online} hasError={s.router.hasError} /> : null,
	},
	{ path: '/checkpoints', label: 'Checkpoints', icon: <Save size={18} /> },
	{ isSeparator: true },

	{ path: '/backends', label: 'Backends', icon: <Blocks size={18} /> },
	{ path: '/recipes', label: 'Recipes', icon: <ScrollText size={18} /> },
	{ isSeparator: true },

	{ path: '/models', label: 'Models', icon: <FolderOpen size={18} /> },
	{
		path: '/hub',
		label: 'Hub',
		icon: <Globe size={18} />,
		badge: (s) => {
			if ((s?.downloads.active ?? 0) > 0) {
				return (
					<Box
						w="5px"
						h="5px"
						borderRadius="full"
						bg="#3381ff"
						boxShadow="0 0 6px rgba(51, 129, 255, 0.6)"
						ml="auto"
						flexShrink={0}
					/>
				);
			}
			if ((s?.downloads.completed ?? 0) > 0) {
				return (
					<Box
						w="5px"
						h="5px"
						borderRadius="full"
						bg="#22c55e"
						boxShadow="0 0 6px rgba(34, 197, 94, 0.5)"
						ml="auto"
						flexShrink={0}
					/>
				);
			}
			return null;
		},
	},
	{ isSeparator: true },

	{
		path: '/mcp',
		label: 'MCP',
		icon: <Plug size={18} />,
		badge: (s) => {
			if (s == null || s.mcp.total === 0) return null;
			if (s.mcp.connecting > 0) {
				return (
					<Box
						w="5px"
						h="5px"
						borderRadius="full"
						bg="#f59e0b"
						boxShadow="0 0 6px rgba(245, 158, 11, 0.6)"
						ml="auto"
						flexShrink={0}
					/>
				);
			}
			if (s.mcp.error > 0) {
				return (
					<Box
						w="5px"
						h="5px"
						borderRadius="full"
						bg="#ef4444"
						boxShadow="0 0 6px rgba(239, 68, 68, 0.6)"
						ml="auto"
						flexShrink={0}
					/>
				);
			}
			if (s.mcp.connected === s.mcp.total) {
				return (
					<Box
						w="5px"
						h="5px"
						borderRadius="full"
						bg="#22c55e"
						boxShadow="0 0 6px rgba(34, 197, 94, 0.5)"
						ml="auto"
						flexShrink={0}
					/>
				);
			}
			return null;
		},
	},
	{ path: '/chat', label: 'Chat', icon: <MessageSquare size={18} /> },
];

const NAV_ITEMS_BOTTOM: INavItem[] = [
	{ path: '/settings', label: 'Settings', icon: <Settings size={18} /> },
	{ path: '/about', label: 'About', icon: <Info size={18} /> },
];

function SidebarLink({
	item,
	collapsed,
	summary,
}: {
	item: INavItem;
	collapsed: boolean;
	summary: ISummaryData | null;
}) {
	// Handle separator
	if (item.isSeparator) {
		return (
			<Box
				w="100%"
				h="1px"
				bg="rgba(255, 255, 255, 0.085)"
				my="2"
			/>
		);
	}

	const location = useLocation();
	const isActive = location.pathname === item.path || (location.pathname === '/' && item.path === '/home');
	const badgeNode = item.badge ? item.badge(summary) : null;

	return (
		<NavLink to={item.path!} style={{ textDecoration: 'none', width: '100%' }}>
			<HStack
				className='no-drag'
				gap={collapsed ? '0' : '3'}
				px={collapsed ? '0' : '3'}
				py="2.5"
				borderRadius="lg"
				cursor="pointer"
				transition="all 0.15s ease"
				bg={isActive ? 'rgba(255, 255, 255, 0.065)' : 'transparent'}
				color={isActive ? '#ccc' : 'rgba(255, 255, 255, 0.5)'}
				borderWidth="1px"
				borderColor={isActive ? 'rgba(90, 90, 90, 0.4)' : 'transparent'}
				justifyContent={collapsed ? 'center' : 'flex-start'}
				_hover={{
					bg: 'rgba(255, 255, 255, 0.08)',
					color: 'rgba(255, 255, 255, 0.8)',
				}}
			>
				<Box position="relative" flexShrink={0}>
					<Flex alignItems="center" justifyContent="center" w="18px">
						{item.icon}
					</Flex>
					{collapsed && badgeNode && (
						<Box position="absolute" top="-6px" right="-8px">
							{badgeNode}
						</Box>
					)}
				</Box>
				{!collapsed && (
					<Text fontSize="13px" fontWeight={isActive ? '600' : '400'} flex="1">
						{item.label}
					</Text>
				)}
				{!collapsed && badgeNode}
			</HStack>
		</NavLink>
	);
}

export const Shell = React.memo(() => {
	const { data: summary } = useSummary();
	const location = useLocation();
	const currentPath = location.pathname;
	// const settings = useStore(s => s.settings);
	const sseConnected = useStore(s => s.sseConnected);
	// const [collapsed] = useDependantState(settings.sidebarCollapsed);

	const isCollapsed = true;

	const {
		installHook,
		handleDoubleClick,
	} = useTauriWindow();

	installHook();

	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<Flex flex="1" overflow="hidden">
				{/* Sidebar */}
				<Flex
					bg={sseConnected ? '#030303' : '#7f1d1d'}
					direction="column"
					w={isCollapsed ? '60px' : '220px'}
					minW={isCollapsed ? '60px' : '220px'}
					borderRightWidth="1px"
					borderColor="rgba(255, 255, 255, 0.1)"
					px={isCollapsed ? '2' : '4'}
					pt={'2'}
					pb={("0")}
					gap="0"
					zIndex={100}
					// boxShadow={"0px 0px 10px rgba(0,0,0,0.5)"}
					style={{
						userSelect: 'none',
						userDrag: 'none',
					}}
					className='drag'
					onDoubleClick={handleDoubleClick}
				>
					{/* Logo */}
					<HStack
						px={isCollapsed ? '0' : '2'}
						py="2"
						mb="3"
						justifyContent="center"
					>
						<Flex w="32px" h="32px" borderRadius="md" overflow="hidden" flexShrink={0} alignItems="center" justifyContent="center">
							<Image src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
						</Flex>
					</HStack>

					{/* Nav */}
					<VStack gap="1" align="stretch" flex="1">
						{NAV_ITEMS.map(item => (
							<SidebarLink key={item.path} item={item} collapsed={!!isCollapsed} summary={summary} />
						))}
					</VStack>

					{/* Footer */}
					<Box px={isCollapsed ? '0' : '2'} py="2">
						<VStack gap="1" align="stretch">
							{NAV_ITEMS_BOTTOM.map(item => (
								<SidebarLink key={item.path} item={item} collapsed={!!isCollapsed} summary={summary} />
							))}
						</VStack>
					</Box>
				</Flex>

				{/* Main content */}
				<Box flex="1" overflow="auto">
					{Object.entries(PAGE_REGISTRY).map(([path, config]) => {
						const isActive = currentPath === path || (currentPath === '/' && path === '/home');

						if (!config.closeOnSwitch) {
							// Persistent: always mounted, toggle visibility with display
							return (
								<Box key={path} display={isActive ? 'block' : 'none'} h="100%">
									<config.component />
								</Box>
							);
						}

						// Non-persistent: only render when active (unmounts on switch)
						if (isActive) {
							return <config.component key={path} />;
						}

						return null;
					})}
				</Box>
			</Flex>
		</Flex>
	);
});
