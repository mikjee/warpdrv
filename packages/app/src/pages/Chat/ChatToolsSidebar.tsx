// ============================================================
// FILE: packages/app/src/components/ChatToolsSidebar.tsx
// Tool list sidebar for the chat page.
// Shows global permissions with reduced opacity.
// Later: per-chat overrides at full opacity.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Box, Flex, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import {
	Wrench,
	ChevronDown,
	ChevronRight,
	ChevronLeft,
	Check,
	X,
	Shield,
	ShieldOff,
	ShieldQuestion,
} from 'lucide-react';
import { useStore } from '../../store';
import { fetchMcpPermissions } from '../../api/mcpServices';
import type { IToolPermission, IServerPermission as IMcpServerPermission, IMcpServerState } from '@warpcore/bridge';
import { EMcpServerStatus, EToolApprovalMode } from '@warpcore/bridge';

function StatusDot({ status }: { status: EMcpServerStatus }) {
	const colors: Record<EMcpServerStatus, string> = {
		[EMcpServerStatus.CONNECTED]: 'var(--wc-accent-green-icon)',
		[EMcpServerStatus.CONNECTING]: 'var(--wc-accent-yellow-strong)',
		[EMcpServerStatus.ERROR]: 'var(--wc-accent-red)',
		[EMcpServerStatus.DISCONNECTED]: 'var(--wc-text-disabled)',
	};
	return <Box w="6px" h="6px" borderRadius="full" bg={colors[status]} flexShrink={0} />;
}

const approvalIcons: Record<EToolApprovalMode, React.ReactNode> = {
	[EToolApprovalMode.ASK]: <ShieldQuestion size={10} />,
	[EToolApprovalMode.ALLOWED]: <Shield size={10} />,
	[EToolApprovalMode.DENIED]: <ShieldOff size={10} />,
};

const approvalColors: Record<EToolApprovalMode, string> = {
	[EToolApprovalMode.ASK]: 'var(--wc-accent-yellow-glow)',
	[EToolApprovalMode.ALLOWED]: 'var(--wc-accent-green)',
	[EToolApprovalMode.DENIED]: 'var(--wc-accent-red)',
};

export function ChatToolsSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
	const mcpServers = useStore((s) => s.mcpServers);
	const [serverPerms, setServerPerms] = useState<IMcpServerPermission[]>([]);
	const [toolPerms, setToolPerms] = useState<IToolPermission[]>([]);
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

	useEffect(() => {
		fetchMcpPermissions().then(res => {
			if (res.ok) {
				setServerPerms(res.data.servers);
				setToolPerms(res.data.tools);
			}
		});
	}, []);

	const serverPermMap = new Map(serverPerms.map(p => [p.serverName, p.enabled]));
	const toolPermMap = new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p]));
	const serverEntries = Object.entries(mcpServers);
	const totalTools = serverEntries.reduce((sum, [, s]) => sum + s.tools.length, 0);

	if (!open) {
		return (
			<Box
				w="36px"
				minW="36px"
				borderLeftWidth="1px"
				borderColor="var(--wc-border-subtle)"
				display="flex"
				flexDirection="column"
				alignItems="center"
				pt="3"
				cursor="pointer"
				onClick={onToggle}
				_hover={{ bg: 'var(--wc-bg-surface)' }}
			>
				<Wrench size={14} color="var(--wc-text-muted)" />
				{totalTools > 0 && (
					<Text fontSize="10px" color="var(--wc-text-faint)" mt="1">{totalTools}</Text>
				)}
			</Box>
		);
	}

	return (
		<Box
			w="260px"
			minW="260px"
borderLeftWidth="1px"
				borderColor="var(--wc-border-subtle)"
				overflow="auto"
				p="3"
		>
			<HStack gap="2" mb="3">
				<Box as="button" onClick={onToggle} p="1" _hover={{ bg: 'var(--wc-bg-hover)' }} borderRadius="sm">
					<ChevronRight size={12} color="var(--wc-text-muted)" />
				</Box>
				<Text fontSize="12px" fontWeight="600" color="var(--wc-text-secondary)" textTransform="uppercase" letterSpacing="0.05em">
					Tools
				</Text>
				<Badge fontSize="9px" px="1.5" borderRadius="sm" bg="var(--wc-bg-surface)" color="var(--wc-text-faint)">
					{totalTools}
				</Badge>
			</HStack>

			{serverEntries.map(([name, state]) => {
				const serverEnabled = serverPermMap.get(name) ?? true;
				const isExpanded = expandedServers[name] ?? true;
				// Global settings shown at reduced opacity
				const globalOpacity = 0.6;

				return (
					<Box key={name} mb="2" opacity={globalOpacity}>
						<HStack
							gap="2"
							px="2"
							py="1"
							borderRadius="sm"
							cursor="pointer"
							_hover={{ bg: 'var(--wc-bg-card)' }}
							onClick={() => setExpandedServers(prev => ({ ...prev, [name]: !prev[name] }))}
						>
							{isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
							<StatusDot status={state.status} />
							<Text flex="1" fontSize="12px" color="var(--wc-text-primary)" fontWeight="500">
								{name}
							</Text>
							{!serverEnabled && (
								<Text fontSize="9px" color="var(--wc-accent-red-border)">OFF</Text>
							)}
						</HStack>

						{isExpanded && serverEnabled && (
							<VStack gap="0" pl="5" mt="0.5">
								{state.tools.map(tool => {
									const perm = toolPermMap.get(`${name}:${tool.name}`);
									const toolEnabled = perm?.enabled ?? true;
									const mode = perm?.approvalMode ?? EToolApprovalMode.ASK;

									return (
										<HStack
											key={tool.name}
											gap="2"
											w="100%"
											px="2"
											py="1"
											borderRadius="sm"
											opacity={toolEnabled ? 1 : 0.4}
										>
											<Box color={approvalColors[mode]} flexShrink={0}>
												{approvalIcons[mode]}
											</Box>
											<Text fontSize="11px" color="var(--wc-text-secondary)" flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
												{tool.name}
											</Text>
										</HStack>
									);
								})}
								{state.tools.length === 0 && (
									<Text fontSize="10px" color="var(--wc-text-faint)" px="2" py="1">No tools</Text>
								)}
							</VStack>
						)}
					</Box>
				);
			})}

			{serverEntries.length === 0 && (
				<Text fontSize="11px" color="var(--wc-text-faint)" textAlign="center" py="4">
					No MCP servers
				</Text>
			)}
		</Box>
	);
}

// ============================================================
// Content panel for tabbed sidebar (no header, no toggle strip)
// ============================================================
export function ChatToolsContentPanel() {
	const mcpServers = useStore((s) => s.mcpServers);
	const [serverPerms, setServerPerms] = useState<IMcpServerPermission[]>([]);
	const [toolPerms, setToolPerms] = useState<IToolPermission[]>([]);
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

	useEffect(() => {
		fetchMcpPermissions().then(res => {
			if (res.ok) {
				setServerPerms(res.data.servers);
				setToolPerms(res.data.tools);
			}
		});
	}, []);

	const serverPermMap = new Map(serverPerms.map(p => [p.serverName, p.enabled]));
	const toolPermMap = new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p]));
	const serverEntries = Object.entries(mcpServers);
	const totalTools = serverEntries.reduce((sum, [, s]) => sum + s.tools.length, 0);

	return (
		<Box p="3">
			{serverEntries.map(([name, state]) => {
				const serverEnabled = serverPermMap.get(name) ?? true;
				const isExpanded = expandedServers[name] ?? true;
				const globalOpacity = 0.6;

				return (
					<Box key={name} mb="2" opacity={globalOpacity}>
						<HStack
							gap="2"
							px="2"
							py="1"
							borderRadius="sm"
							cursor="pointer"
							_hover={{ bg: 'var(--wc-bg-card)' }}
							onClick={() => setExpandedServers(prev => ({ ...prev, [name]: !prev[name] }))}
						>
							{isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
							<StatusDot status={state.status} />
							<Text flex="1" fontSize="12px" color="var(--wc-text-primary)" fontWeight="500">
								{name}
							</Text>
							{!serverEnabled && (
								<Text fontSize="9px" color="var(--wc-accent-red-border)">OFF</Text>
							)}
						</HStack>

						{isExpanded && serverEnabled && (
							<VStack gap="0" pl="5" mt="0.5">
								{state.tools.map(tool => {
									const perm = toolPermMap.get(`${name}:${tool.name}`);
									const toolEnabled = perm?.enabled ?? true;
									const mode = perm?.approvalMode ?? EToolApprovalMode.ASK;

									return (
										<HStack
											key={tool.name}
											gap="2"
											w="100%"
											px="2"
											py="1"
											borderRadius="sm"
											opacity={toolEnabled ? 1 : 0.4}
										>
											<Box color={approvalColors[mode]} flexShrink={0}>
												{approvalIcons[mode]}
											</Box>
											<Text fontSize="11px" color="var(--wc-text-secondary)" flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
												{tool.name}
											</Text>
										</HStack>
									);
								})}
								{state.tools.length === 0 && (
									<Text fontSize="10px" color="var(--wc-text-faint)" px="2" py="1">No tools</Text>
								)}
							</VStack>
						)}
					</Box>
				);
			})}

			{serverEntries.length === 0 && (
				<Text fontSize="11px" color="var(--wc-text-faint)" textAlign="center" py="4">
					No MCP servers
				</Text>
			)}
		</Box>
	);
}
