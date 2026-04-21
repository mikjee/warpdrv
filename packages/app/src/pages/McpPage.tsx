// ============================================================
// FILE: packages/app/src/pages/McpPage.tsx
// MCP configuration page with server list, config editor,
// and tool permissions sidebar.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
	Box,
	Flex,
	Text,
	HStack,
	VStack,
	Input,
	Textarea,
	Badge,
} from '@chakra-ui/react';
import {
	Plug,
	Plus,
	Trash2,
	RefreshCw,
	RotateCcw,
	ChevronDown,
	ChevronRight,
	Circle,
	Check,
	X,
	Shield,
	ShieldOff,
	ShieldQuestion,
} from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { useStore } from '../store';
import {
	fetchMcpConfig,
	updateMcpConfig,
	addMcpServer,
	removeMcpServerEntry,
	restartMcpServer,
	refreshMcpServerTools,
	reloadMcpServers,
	fetchMcpPermissions,
	setMcpServerPermission,
	setMcpToolPermission,
} from '../api/mcpServices';
import type { IMcpConfigFile, IMcpServerEntry } from '@warpcore/shared';
import type { IMcpServerState, IToolPermission, IServerPermission as IMcpServerPermission } from '@warpcore/bridge';
import { EMcpServerStatus, EMcpTransportType, EToolApprovalMode } from '@warpcore/bridge';

// ============================================================
// Status indicator
// ============================================================
function StatusDot({ status }: { status: EMcpServerStatus }) {
	const colors: Record<EMcpServerStatus, string> = {
		[EMcpServerStatus.CONNECTED]: '#22c55e',
		[EMcpServerStatus.CONNECTING]: '#f59e0b',
		[EMcpServerStatus.ERROR]: '#ef4444',
		[EMcpServerStatus.DISCONNECTED]: 'rgba(255,255,255,0.15)',
	};
	return <Box w="8px" h="8px" borderRadius="full" bg={colors[status]} flexShrink={0} />;
}

// ============================================================
// Approval mode selector
// ============================================================
function ApprovalModeButton({
	mode,
	currentMode,
	onSelect,
}: {
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
		[EToolApprovalMode.ASK]: 'rgba(245,158,11,0.2)',
		[EToolApprovalMode.ALLOWED]: 'rgba(34,197,94,0.2)',
		[EToolApprovalMode.DENIED]: 'rgba(239,68,68,0.2)',
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
			color={isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)'}
			_hover={{ bg: isActive ? activeColors[mode] : 'rgba(255,255,255,0.05)' }}
			onClick={() => onSelect(mode)}
		>
			{icons[mode]}
			<Text fontSize="11px">{labels[mode]}</Text>
		</HStack>
	);
}

// ============================================================
// Tool list sidebar
// ============================================================
function ToolListSidebar({
	mcpServers,
	serverPermissions,
	toolPermissions,
	onToggleServer,
	onSetToolPermission,
}: {
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
			borderColor="rgba(255,255,255,0.06)"
			overflow="auto"
			p="3"
		>
			<Text fontSize="12px" fontWeight="600" color="rgba(255,255,255,0.5)" mb="3" textTransform="uppercase" letterSpacing="0.05em">
				Tools
			</Text>

			{Object.entries(mcpServers).map(([name, state]) => {
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
							_hover={{ bg: 'rgba(255,255,255,0.03)' }}
							onClick={() => toggleExpand(name)}
							opacity={serverEnabled ? 1 : 0.4}
						>
							{isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
							<StatusDot status={state.status} />
							<Text flex="1" fontSize="13px" color="rgba(255,255,255,0.8)" fontWeight="500">
								{name}
							</Text>
							<Badge
								fontSize="10px"
								px="1.5"
								py="0.5"
								borderRadius="sm"
								bg="rgba(255,255,255,0.06)"
								color="rgba(255,255,255,0.4)"
							>
								{state.tools.length}
							</Badge>
							<Box
								as="button"
								onClick={(e: React.MouseEvent) => {
									e.stopPropagation();
									onToggleServer(name, !serverEnabled);
								}}
								p="1"
								borderRadius="sm"
								_hover={{ bg: 'rgba(255,255,255,0.08)' }}
							>
								{serverEnabled ? <Check size={12} color="rgba(34,197,94,0.8)" /> : <X size={12} color="rgba(239,68,68,0.6)" />}
							</Box>
						</HStack>

						{isExpanded && serverEnabled && (
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
														? <Check size={11} color="rgba(34,197,94,0.8)" />
														: <X size={11} color="rgba(239,68,68,0.6)" />
													}
												</Box>
												<Text fontSize="12px" color="rgba(255,255,255,0.7)" flex="1">
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
												<Text fontSize="11px" color="rgba(255,255,255,0.3)" pl="4" mt="1">
													{tool.description}
												</Text>
											)}
										</Box>
									);
								})}
								{state.tools.length === 0 && (
									<Text fontSize="11px" color="rgba(255,255,255,0.25)" px="2" py="1">
										No tools available
									</Text>
								)}
							</VStack>
						)}
					</Box>
				);
			})}

			{Object.keys(mcpServers).length === 0 && (
				<Text fontSize="12px" color="rgba(255,255,255,0.25)" textAlign="center" py="4">
					No MCP servers configured
				</Text>
			)}
		</Box>
	);
}

// ============================================================
// Add server dialog (inline)
// ============================================================
function AddServerForm({ onAdd, onCancel }: { onAdd: (name: string, entry: IMcpServerEntry) => void; onCancel: () => void }) {
	const [name, setName] = useState('');
	const [type, setType] = useState<'stdio' | 'http'>('stdio');
	const [command, setCommand] = useState('');
	const [args, setArgs] = useState('');
	const [url, setUrl] = useState('');

	function handleSubmit() {
		if (!name.trim()) return;
		const entry: IMcpServerEntry = type === 'stdio'
			? { command: command.trim(), args: args.trim() ? args.split(/\s+/) : [] }
			: { url: url.trim() };
		onAdd(name.trim(), entry);
	}

	return (
		<Box
			p="3"
			borderWidth="1px"
			borderColor="rgba(255,255,255,0.1)"
			borderRadius="md"
			bg="rgba(255,255,255,0.02)"
			mb="3"
		>
			<VStack gap="2" align="stretch">
				<Input
					placeholder="Server name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					size="sm"
					bg="rgba(0,0,0,0.2)"
					borderColor="rgba(255,255,255,0.1)"
					fontSize="13px"
				/>
				<HStack gap="2">
					{(['stdio', 'http'] as const).map(t => (
						<Box
							key={t}
							as="button"
							px="3"
							py="1"
							fontSize="12px"
							borderRadius="sm"
							bg={type === t ? 'rgba(255,255,255,0.1)' : 'transparent'}
							color={type === t ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'}
							onClick={() => setType(t)}
						>
							{t.toUpperCase()}
						</Box>
					))}
				</HStack>
				{type === 'stdio' ? (
					<>
						<Input
							placeholder="Command (e.g. npx, uvx, node)"
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							size="sm"
							bg="rgba(0,0,0,0.2)"
							borderColor="rgba(255,255,255,0.1)"
							fontSize="13px"
						/>
						<Input
							placeholder="Arguments (space-separated)"
							value={args}
							onChange={(e) => setArgs(e.target.value)}
							size="sm"
							bg="rgba(0,0,0,0.2)"
							borderColor="rgba(255,255,255,0.1)"
							fontSize="13px"
						/>
					</>
				) : (
					<Input
						placeholder="URL (e.g. https://example.com/mcp)"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						size="sm"
						bg="rgba(0,0,0,0.2)"
						borderColor="rgba(255,255,255,0.1)"
						fontSize="13px"
					/>
				)}
				<HStack gap="2" justify="flex-end">
					<Box as="button" px="3" py="1" fontSize="12px" color="rgba(255,255,255,0.5)" onClick={onCancel}>
						Cancel
					</Box>
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="rgba(255,255,255,0.1)"
						color="rgba(255,255,255,0.8)"
						_hover={{ bg: 'rgba(255,255,255,0.15)' }}
						onClick={handleSubmit}
					>
						Add
					</Box>
				</HStack>
			</VStack>
		</Box>
	);
}

// ============================================================
// Server list card
// ============================================================
function ServerCard({
	name,
	entry,
	state,
	onRestart,
	onRefresh,
	onRemove,
}: {
	name: string;
	entry: IMcpServerEntry;
	state: IMcpServerState | null;
	onRestart: () => void;
	onRefresh: () => void;
	onRemove: () => void;
}) {
	const status = state?.status ?? EMcpServerStatus.DISCONNECTED;
	const transportType = entry.url ? 'HTTP' : 'STDIO';
	const connectionDetail = entry.url ?? `${entry.command} ${(entry.args ?? []).join(' ')}`;

	return (
		<Box
			p="3"
			borderWidth="1px"
			borderColor="rgba(255,255,255,0.06)"
			borderRadius="md"
			bg="rgba(255,255,255,0.02)"
			_hover={{ borderColor: 'rgba(255,255,255,0.1)' }}
		>
			<HStack gap="3" mb="2">
				<StatusDot status={status} />
				<Text fontSize="14px" fontWeight="500" color="rgba(255,255,255,0.85)" flex="1">
					{name}
				</Text>
				<Badge
					fontSize="10px"
					px="1.5"
					borderRadius="sm"
					bg="rgba(255,255,255,0.06)"
					color="rgba(255,255,255,0.4)"
				>
					{transportType}
				</Badge>
				{state && (
					<Badge
						fontSize="10px"
						px="1.5"
						borderRadius="sm"
						bg="rgba(255,255,255,0.06)"
						color="rgba(255,255,255,0.4)"
					>
						{state.tools.length} tools
					</Badge>
				)}
			</HStack>

			<Text fontSize="11px" color="rgba(255,255,255,0.35)" mb="2" fontFamily="mono">
				{connectionDetail}
			</Text>

			{state?.error && (
				<Text fontSize="11px" color="rgba(239,68,68,0.8)" mb="2">
					{state.error}
				</Text>
			)}

			<HStack gap="1" justify="flex-end">
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(255,255,255,0.06)' }}
					onClick={onRefresh}
					title="Refresh tools"
				>
					<RefreshCw size={13} color="rgba(255,255,255,0.4)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(255,255,255,0.06)' }}
					onClick={onRestart}
					title="Restart server"
				>
					<RotateCcw size={13} color="rgba(255,255,255,0.4)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(239,68,68,0.1)' }}
					onClick={onRemove}
					title="Remove server"
				>
					<Trash2 size={13} color="rgba(239,68,68,0.5)" />
				</Box>
			</HStack>
		</Box>
	);
}

// ============================================================
// JSON editor view
// ============================================================
function JsonEditorView({
	config,
	onSave,
}: {
	config: IMcpConfigFile;
	onSave: (config: IMcpConfigFile) => void;
}) {
	const [text, setText] = useState(JSON.stringify(config, null, '\t'));
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setText(JSON.stringify(config, null, '\t'));
	}, [config]);

	function handleSave() {
		try {
			const parsed = JSON.parse(text);
			if (!parsed.mcpServers) {
				setError('Missing "mcpServers" key');
				return;
			}
			setError(null);
			onSave(parsed);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Invalid JSON');
		}
	}

	return (
		<VStack gap="2" align="stretch" flex="1">
			<Textarea
				value={text}
				onChange={(e) => { setText(e.target.value); setError(null); }}
				fontFamily="mono"
				fontSize="12px"
				bg="rgba(0,0,0,0.3)"
				borderColor="rgba(255,255,255,0.08)"
				color="rgba(255,255,255,0.8)"
				flex="1"
				minH="300px"
				resize="vertical"
			/>
			{error && (
				<Text fontSize="11px" color="rgba(239,68,68,0.8)">{error}</Text>
			)}
			<HStack justify="flex-end">
				<Box
					as="button"
					px="3"
					py="1.5"
					fontSize="12px"
					borderRadius="sm"
					bg="rgba(255,255,255,0.1)"
					color="rgba(255,255,255,0.8)"
					_hover={{ bg: 'rgba(255,255,255,0.15)' }}
					onClick={handleSave}
				>
					Save & Reload
				</Box>
			</HStack>
		</VStack>
	);
}

// ============================================================
// Main MCP Page
// ============================================================
export function McpPage() {
	const mcpServers = useStore((s) => s.mcpServers);
	const [config, setConfig] = useState<IMcpConfigFile | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [viewMode, setViewMode] = useState<'cards' | 'json'>('cards');
	const [serverPerms, setServerPerms] = useState<IMcpServerPermission[]>([]);
	const [toolPerms, setToolPerms] = useState<IToolPermission[]>([]);

	// Load config and permissions
	const loadData = useCallback(async () => {
		const [configRes, permRes] = await Promise.all([
			fetchMcpConfig(),
			fetchMcpPermissions(),
		]);
		if (configRes.ok) setConfig(configRes.data);
		if (permRes.ok) {
			setServerPerms(permRes.data.servers);
			setToolPerms(permRes.data.tools);
		}
	}, []);

	useEffect(() => { loadData(); }, [loadData]);

	async function handleAddServer(name: string, entry: IMcpServerEntry) {
		await addMcpServer(name, entry);
		setShowAddForm(false);
		loadData();
	}

	async function handleRemoveServer(name: string) {
		await removeMcpServerEntry(name);
		loadData();
	}

	async function handleRestart(name: string) {
		await restartMcpServer(name);
	}

	async function handleRefresh(name: string) {
		await refreshMcpServerTools(name);
	}

	async function handleSaveConfig(newConfig: IMcpConfigFile) {
		await updateMcpConfig(newConfig);
		loadData();
	}

	async function handleToggleServer(name: string, enabled: boolean) {
		await setMcpServerPermission(name, enabled);
		loadData();
	}

	async function handleSetToolPermission(serverName: string, toolName: string, enabled: boolean, mode: EToolApprovalMode) {
		await setMcpToolPermission(serverName, toolName, enabled, mode);
		loadData();
	}

	const serverEntries = config?.mcpServers ?? {};

	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<PageHeader
				title="MCP"
				subtitle={`${Object.entries(serverEntries).length} Servers`}
				icon={<Plug size={20} />}
				actions={
					<HStack gap="2">
						{(['cards', 'json'] as const).map(m => (
							<Box
								key={m}
								as="button"
								px="3"
								py="1"
								fontSize="12px"
								borderRadius="sm"
								bg={viewMode === m ? 'rgba(255,255,255,0.1)' : 'transparent'}
								color={viewMode === m ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
								onClick={() => setViewMode(m)}
							>
								{m === 'cards' ? 'Servers' : 'JSON'}
							</Box>
						))}
						<Box
							as="button"
							p="1.5"
							borderRadius="sm"
							_hover={{ bg: 'rgba(255,255,255,0.06)' }}
							onClick={() => reloadMcpServers()}
							title="Reload all servers"
						>
							<RefreshCw size={14} color="rgba(255,255,255,0.5)" />
						</Box>
						<Box
							as="button"
							p="1.5"
							borderRadius="sm"
							_hover={{ bg: 'rgba(255,255,255,0.06)' }}
							onClick={() => setShowAddForm(true)}
							title="Add server"
						>
							<Plus size={14} color="rgba(255,255,255,0.5)" />
						</Box>
					</HStack>
				}
			/>

			<Flex flex="1" overflow="hidden">
				{/* Main content */}
				<Box flex="1" overflow="auto" p="4">
					{showAddForm && (
						<AddServerForm
							onAdd={handleAddServer}
							onCancel={() => setShowAddForm(false)}
						/>
					)}

					{viewMode === 'cards' ? (
						<VStack gap="2" align="stretch">
							{Object.entries(serverEntries).map(([name, entry]) => (
								<ServerCard
									key={name}
									name={name}
									entry={entry}
									state={mcpServers[name] ?? null}
									onRestart={() => handleRestart(name)}
									onRefresh={() => handleRefresh(name)}
									onRemove={() => handleRemoveServer(name)}
								/>
							))}
							{Object.keys(serverEntries).length === 0 && !showAddForm && (
								<Text fontSize="13px" color="rgba(255,255,255,0.3)" textAlign="center" py="8">
									No MCP servers configured. Click + to add one, or edit the JSON directly.
								</Text>
							)}
						</VStack>
					) : (
						config && <JsonEditorView config={config} onSave={handleSaveConfig} />
					)}
				</Box>

				{/* Tool list sidebar */}
				<ToolListSidebar
					mcpServers={mcpServers}
					serverPermissions={serverPerms}
					toolPermissions={toolPerms}
					onToggleServer={handleToggleServer}
					onSetToolPermission={handleSetToolPermission}
				/>
			</Flex>
		</Flex>
	);
}
