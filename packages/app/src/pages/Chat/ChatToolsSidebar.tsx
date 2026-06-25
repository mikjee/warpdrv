// ============================================================
// FILE: packages/app/src/components/ChatToolsSidebar.tsx
// Tool list sidebar for the chat page.
// Reads global permissions from Zustand (populated via SSE).
// Thread overrides fetched on thread change, stored in Zustand.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import {
	Wrench,
	ChevronDown,
	ChevronRight,
	Shield,
	ShieldOff,
	ShieldQuestion,
	Globe,
} from 'lucide-react';
import { useStore } from '../../store';
import { fetchThreadPermissions, setThreadToolPermission, resetThreadToolPermission } from '../../api/mcpServices';
import type { IThreadToolPermission } from '@warpcore/bridge';
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

// 4-level selector: Global (inherited), Ask, Allow, Deny
function ThreadApprovalButton({ mode, currentMode, isOverridden, isActive, onSelect }: {
	mode: EToolApprovalMode | null;
	currentMode: EToolApprovalMode;
	isOverridden: boolean;
	isActive: boolean;
	onSelect: () => void;
}) {
	const icons: Record<string, React.ReactNode> = {
		'null': <Globe size={9} />,
		[EToolApprovalMode.ASK]: <ShieldQuestion size={9} />,
		[EToolApprovalMode.ALLOWED]: <Shield size={9} />,
		[EToolApprovalMode.DENIED]: <ShieldOff size={9} />,
	};
	const labels: Record<string, string> = {
		'null': 'Global',
		[EToolApprovalMode.ASK]: 'Ask',
		[EToolApprovalMode.ALLOWED]: 'Allow',
		[EToolApprovalMode.DENIED]: 'Deny',
	};
	const activeColors: Record<string, string> = {
		'null': 'var(--wc-bg-active)',
		[EToolApprovalMode.ASK]: 'var(--wc-accent-yellow-hover-bg)',
		[EToolApprovalMode.ALLOWED]: 'var(--wc-accent-green-bg-8)',
		[EToolApprovalMode.DENIED]: 'var(--wc-accent-red-alt-bg)',
	};
	const key = mode ?? 'null';

	return (
		<Box
			px="1.5"
			py="0.5"
			borderRadius="sm"
			cursor="pointer"
			fontSize="9px"
			bg={isActive ? activeColors[key] : 'transparent'}
			color={isActive ? 'var(--wc-text-heading)' : 'var(--wc-text-muted)'}
			_hover={{ bg: isActive ? activeColors[key] : 'var(--wc-bg-hover)' }}
			onClick={onSelect}
		>
			<HStack gap="0.5">
				{icons[key]}
				<Text fontSize="9px">{labels[key]}</Text>
			</HStack>
		</Box>
	);
}

export function ChatToolsSidebar({ open, onToggle }: { open: boolean; onToggle: () => void }) {
	const mcpServers = useStore((s) => s.mcpServers);
	const serverPerms = useStore((s) => s.serverPermissions);
	const toolPerms = useStore((s) => s.toolPermissions);
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

	const serverPermMap = useMemo(() => new Map(serverPerms.map(p => [p.serverName, p.enabled])), [serverPerms]);
	const toolPermMap = useMemo(() => new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p])), [toolPerms]);
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

				return (
					<Box key={name} mb="2" opacity={serverEnabled ? 1 : 0.4}>
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
export function ChatToolsContentPanel({ threadId }: { threadId?: string | null }) {
	const mcpServers = useStore((s) => s.mcpServers);
	const serverPerms = useStore((s) => s.serverPermissions);
	const toolPerms = useStore((s) => s.toolPermissions);
	const threadToolPermissions = useStore((s) => s.threadToolPermissions);
	const threadOverrides = threadId ? (threadToolPermissions[threadId] ?? []) : [];
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

	useEffect(() => {
		if (!threadId) return;
		fetchThreadPermissions(threadId).then(res => {
			if (res.ok) {
				useStore.setState(draft => {
					draft.threadToolPermissions[threadId] = res.data.threadOverrides;
				});
			}
		});
	}, [threadId]);

	const serverPermMap = useMemo(() => new Map(serverPerms.map(p => [p.serverName, p.enabled])), [serverPerms]);
	const toolPermMap = useMemo(() => new Map(toolPerms.map(p => [`${p.serverName}:${p.toolName}`, p])), [toolPerms]);
	const threadOverrideMap = useMemo(() => new Map(threadOverrides.map(p => [`${p.serverName}:${p.toolName}`, p])), [threadOverrides]);
	const serverEntries = Object.entries(mcpServers);

	const handleSetThreadPermission = useCallback(async (serverName: string, toolName: string, mode: EToolApprovalMode | null) => {
		if (!threadId) return;
		if (mode === null) {
			await resetThreadToolPermission(threadId, serverName, toolName);
		} else {
			await setThreadToolPermission(threadId, serverName, toolName, true, mode);
		}
		fetchThreadPermissions(threadId).then(res => {
			if (res.ok) {
				useStore.setState(draft => {
					draft.threadToolPermissions[threadId] = res.data.threadOverrides;
				});
			}
		});
	}, [threadId]);

	return (
		<Box p="3">
			{serverEntries.map(([name, state]) => {
				const serverEnabled = serverPermMap.get(name) ?? true;
				const isExpanded = expandedServers[name] ?? true;

				return (
					<Box key={name} mb="2" opacity={serverEnabled ? 1 : 0.4}>
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
							<VStack gap="0" pl="5" mt="0.5" align="stretch">
								{state.tools.map(tool => {
									const globalPerm = toolPermMap.get(`${name}:${tool.name}`);
									const threadPerm = threadOverrideMap.get(`${name}:${tool.name}`);
									const isOverridden = threadPerm != null;
									const effectiveMode = threadPerm?.approvalMode ?? globalPerm?.approvalMode ?? EToolApprovalMode.ASK;
									const toolEnabled = (threadPerm?.enabled ?? globalPerm?.enabled ?? true);

									return (
										<Box
											key={tool.name}
											px="2"
											py="1.5"
											borderRadius="sm"
											opacity={toolEnabled ? 1 : 0.4}
										>
											<HStack gap="2" mb={isOverridden ? "0.5" : "0"}>
												<Box color={approvalColors[effectiveMode]} flexShrink={0}>
													{approvalIcons[effectiveMode]}
												</Box>
												<Text fontSize="11px" color="var(--wc-text-secondary)" flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
													{tool.name}
												</Text>
												{isOverridden && (
													<Text fontSize="8px" color="var(--wc-text-faint)" textTransform="uppercase" flexShrink={0}>
														override
													</Text>
												)}
											</HStack>
											<HStack gap="0.5" pl="4">
												{[null, EToolApprovalMode.ASK, EToolApprovalMode.ALLOWED, EToolApprovalMode.DENIED].map((m, i) => (
													<ThreadApprovalButton
														key={i}
														mode={m}
														currentMode={effectiveMode}
														isOverridden={isOverridden}
														isActive={m === null ? !isOverridden : isOverridden && effectiveMode === m}
														onSelect={() => handleSetThreadPermission(name, tool.name, m)}
													/>
												))}
											</HStack>
										</Box>
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
