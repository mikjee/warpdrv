import React, { useState } from 'react';
import { Box, Text, HStack, VStack, Badge } from '@chakra-ui/react';
import { ChevronDown, ChevronRight, Check, X, Shield, ShieldOff, ShieldQuestion } from 'lucide-react';
import { McpStatusDot } from './McpStatusDot';
import type { IMcpServerState, IToolPermission, IServerPermission as IMcpServerPermission } from '@warpcore/bridge';
import { EMcpServerStatus, EToolApprovalMode } from '@warpcore/bridge';

function ApprovalModeButton({ mode, currentMode, onSelect }: {
	mode: EToolApprovalMode;
	currentMode: EToolApprovalMode;
	onSelect: (m: EToolApprovalMode) => void;
}) {
	const isActive = mode === currentMode;
	const icons: Record<EToolApprovalMode, React.ReactNode> = {
		[EToolApprovalMode.ASK]: <ShieldQuestion size={12} />,
		[EToolApprovalMode.ALLOWED]: <Shield size={12} />,
		[EToolApprovalMode.DENIED]: <ShieldOff size={12} />,
	};
	const labels: Record<EToolApprovalMode, string> = {
		[EToolApprovalMode.ASK]: 'Ask',
		[EToolApprovalMode.ALLOWED]: 'Allow',
		[EToolApprovalMode.DENIED]: 'Deny',
	};
	const activeColors: Record<EToolApprovalMode, string> = {
		[EToolApprovalMode.ASK]: 'var(--wc-accent-yellow-hover-bg)',
		[EToolApprovalMode.ALLOWED]: 'var(--wc-accent-green-bg-8)',
		[EToolApprovalMode.DENIED]: 'var(--wc-accent-red-alt-bg)',
	};

	return (
		<HStack
			gap="1"
			px="2"
			py="1"
			borderRadius="sm"
			cursor="pointer"
			fontSize="11px"
			bg={isActive ? activeColors[mode] : 'transparent'}
			color={isActive ? 'var(--wc-text-heading)' : 'var(--wc-text-muted)'}
			_hover={{ bg: isActive ? activeColors[mode] : 'var(--wc-bg-hover)' }}
			onClick={() => onSelect(mode)}
		>
			{icons[mode]}
			<Text fontSize="11px">{labels[mode]}</Text>
		</HStack>
	);
}

export function ToolListSidebar({ serverNames, mcpServers, serverPermissions, toolPermissions, onToggleServer, onSetToolPermission }: {
	serverNames: string[];
	mcpServers: Record<string, IMcpServerState>;
	serverPermissions: IMcpServerPermission[];
	toolPermissions: IToolPermission[];
	onToggleServer: (name: string, enabled: boolean) => void;
	onSetToolPermission: (serverName: string, toolName: string, enabled: boolean, mode: EToolApprovalMode) => void;
}) {
	const [expandedServers, setExpandedServers] = useState<Record<string, boolean>>({});

	const serverPermMap = new Map(serverPermissions.map(p => [p.serverName, p.enabled]));
	const toolPermMap = new Map(toolPermissions.map(p => [`${p.serverName}:${p.toolName}`, p]));

	function toggleExpand(name: string) {
		setExpandedServers(prev => ({ ...prev, [name]: !prev[name] }));
	}

	return (
		<Box
			w="320px"
			minW="320px"
			borderLeftWidth="1px"
			borderColor="var(--wc-border-subtle)"
			overflow="auto"
			p="3"
		>
			<Text fontSize="12px" fontWeight="600" color="var(--wc-text-muted)" mb="3" textTransform="uppercase" letterSpacing="0.05em">
				Tools
			</Text>

			{serverNames.map(name => {
				const state = mcpServers[name];
				const serverEnabled = serverPermMap.get(name) ?? true;
				const isExpanded = expandedServers[name] ?? false;

				return (
					<Box key={name} mb="2">
						<HStack
							gap="2"
							px="2"
							py="1.5"
							borderRadius="md"
							cursor="pointer"
							_hover={{ bg: 'var(--wc-bg-hover)' }}
							onClick={() => toggleExpand(name)}
							opacity={serverEnabled ? 1 : 0.4}
						>
							{isExpanded ? <ChevronDown size={12} color="var(--wc-text-muted)" /> : <ChevronRight size={12} color="var(--wc-text-muted)" />}
							<McpStatusDot status={state?.status ?? EMcpServerStatus.DISCONNECTED} />
							<Text flex="1" fontSize="13px" color="var(--wc-text-heading)" fontWeight="500">
								{name}
							</Text>
							<Badge
								fontSize="10px"
								px="1.5"
								py="0.5"
								borderRadius="sm"
								bg="var(--wc-bg-hover)"
								color="var(--wc-text-muted)"
							>
								{state?.tools.length ?? 0}
							</Badge>
							<Box
								as="button"
								onClick={(e: React.MouseEvent) => {
									e.stopPropagation();
									onToggleServer(name, !serverEnabled);
								}}
								p="1"
								borderRadius="sm"
								_hover={{ bg: 'var(--wc-bg-hover)' }}
							>
								{serverEnabled ? <Check size={12} color="var(--wc-accent-green-icon)" /> : <X size={12} color="var(--wc-accent-red-alt)" />}
							</Box>
						</HStack>

						{isExpanded && serverEnabled && state && (
							<VStack gap="0" pl="6" mt="1">
								{state.tools.map(tool => {
									const perm = toolPermMap.get(`${name}:${tool.name}`);
									const toolEnabled = perm?.enabled ?? true;
									const approvalMode = perm?.approvalMode ?? EToolApprovalMode.ASK;

									return (
										<Box
											key={tool.name}
											w="100%"
											px="2"
											py="1.5"
											borderRadius="sm"
											opacity={toolEnabled ? 1 : 0.4}
										>
											<HStack gap="2" mb="1">
												<Box
													as="button"
													onClick={() => onSetToolPermission(name, tool.name, !toolEnabled, approvalMode)}
													flexShrink={0}
												>
													{toolEnabled
														? <Check size={11} color="var(--wc-accent-green-icon)" />
														: <X size={11} color="var(--wc-accent-red-alt)" />
													}
												</Box>
												<Text fontSize="12px" color="var(--wc-text-secondary)" flex="1">
													{tool.name}
												</Text>
											</HStack>
											{toolEnabled && (
												<HStack gap="1" pl="4">
													{[EToolApprovalMode.ASK, EToolApprovalMode.ALLOWED, EToolApprovalMode.DENIED].map(m => (
														<ApprovalModeButton
															key={m}
															mode={m}
															currentMode={approvalMode}
															onSelect={(newMode) => onSetToolPermission(name, tool.name, toolEnabled, newMode)}
														/>
													))}
												</HStack>
											)}
											{tool.description && (
												<Text fontSize="11px" color="var(--wc-text-muted)" pl="4" mt="1">
													{tool.description}
												</Text>
											)}
										</Box>
									);
								})}
								{state.tools.length === 0 && (
									<Text fontSize="11px" color="var(--wc-text-disabled)" px="2" py="1">
										No tools available
									</Text>
								)}
							</VStack>
						)}
					</Box>
				);
			})}

			{serverNames.length === 0 && (
				<Text fontSize="12px" color="var(--wc-text-disabled)" textAlign="center" py="4">
					No MCP servers configured
				</Text>
			)}
		</Box>
	);
}
