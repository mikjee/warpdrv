import { Box, Text, HStack, VStack, Flex, Button, Spinner, Badge, Input, Switch, InputGroup, Combobox, createListCollection, Portal, Popover, HoverCard, Icon } from '@chakra-ui/react';
import {
	Play, Square, RotateCcw, Server, Clock, Trash2, X, Plus,
	Activity, Gauge, Cpu, Blocks, Terminal, Edit, Search, ChevronDown, ArrowUpAZ, ArrowDownZA, Sparkles, Save, Zap
} from 'lucide-react';
import { LuSaveOff } from "react-icons/lu";
import { GoEyeClosed } from "react-icons/go";
import { FaBrain, FaBookOpen, FaRegEye } from 'react-icons/fa6';
import React, { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../hooks/useDependantState';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { VramBar } from '../components/VramBar';
import { LaunchServerDialog } from '../components/dialogs/LaunchServerDialog';
import { ServerLogs } from '../components/dialogs/ServerLogs';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { useMutation } from '../hooks/useQuery';
import { useStore } from '../store';
import { stopServer, restartServer, removeServer, updateServer, updateSettings, clearStickyRoute } from '../api/services';
import type { IServer, IServerStats, IBackend, IBackendGroup, IModel, TSortField, TSortOrder } from '@warpcore/shared';
import { SlotPill } from '../components/SlotPill';
import { SaveCheckpointDialog } from '../components/dialogs/SaveCheckpointDialog';
import { LoadCheckpointDialog } from '../components/dialogs/LoadCheckpointDialog';
import { EServerStatus } from '@warpcore/shared';

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q5_K_M: '#34d399', Q5_K_S: '#34d399', Q4_K_S: '#34d399', Q3_K_M: '#fbbf24',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24', IQ3_XS: '#fbbf24',
	IQ4_XS: '#fbbf24', MXFP4: '#a78bfa', NVFP4: '#a78bfa',
	F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)', F16: 'rgba(255, 255, 255, 0.4)',
};

function formatUptime(startedAt: number | null): string {
	if (!startedAt) return '-';
	const ms = Date.now() - startedAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h ${mins % 60}m`;
}

function formatCount(n: number): string {
	if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
	if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
	return String(n);
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="1.5" py="0.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)">
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			{/* <Text fontSize="11px" color="rgba(255, 255, 255, 0.35)">{label}</Text> */}
			<Text fontSize="11px" fontWeight="400" color="rgba(255, 255, 255, 0.75)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}

const FIELD_LABELS: Record<TSortField, string> = {
	name: 'Name',
	recency: 'Recently Used',
	backend: 'Backend',
};

export const ServersPage = React.memo(() => {
	const serversRecord = useStore((s) => s.servers);
	const serverSlots = useStore((s) => s.serverSlots);
	const servers = useMemo(() => Object.values(serversRecord), [serversRecord]);

	const backendsRecord = useStore((s) => s.backends);
	const backendGroupsRecord = useStore((s) => s.backendGroups);
	const modelsRecord = useStore((s) => s.models);

	const backends = useMemo(() => Object.values(backendsRecord), [backendsRecord]);
	const groups = useMemo(() => Object.values(backendGroupsRecord), [backendGroupsRecord]);
	const models = useMemo(() => Object.values(modelsRecord), [modelsRecord]);

	// Filter and sort state
	const [searchQuery, setSearchQuery] = useState('');
	const [runningOnly, setRunningOnly] = useState(false);
	const settings = useStore(s => s.settings);
	const [sortField, setSortField] = useDependantState(settings.serversSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.serversSortOrder);

	// Save sort settings when they change
	const handleSortChange = useCallback((field: TSortField, order: TSortOrder) => {
		setSortField(field);
		setSortOrder(order);
		updateSettings({ serversSortField: field, serversSortOrder: order });
	}, []);

	// Build lookup maps (memoized to ensure re-renders when data changes)
	const backendMap = useMemo(() => new Map(backends.map(b => [b.id, b])), [backends]);
	const modelByPath = useMemo(() => {
		const map = new Map<string, IModel>();
		models.forEach(m => {
			if (m.primaryFile) {
				map.set(m.primaryFile.filePath, m);
			}
			m.files.forEach(f => {
				if (!m.primaryFile || f.filePath !== m.primaryFile.filePath) {
					map.set(f.filePath, m);
				}
			});
		});
		return map;
	}, [models]);

	// Build backend and group lookup maps
	const groupMap = useMemo(() => new Map(groups.map(g => [g.id, g])), [groups]);

	// Fuzzy search matching against multiple fields
	function matchesSearch(server: IServer, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		const backend = backendMap.get(server.backendId || '');
		const group = groupMap.get(server.backendGroupId || '');
		const model = modelByPath.get(server.modelPath);

		// Search against: serverName, aliases, backend name, group name, device, model name/path
		const searchableParts = [
			server.serverName,
			...(server.serverAlias ?? []),
			backend?.name ?? '',
			group?.name ?? '',
			getDeviceName(server),
			model?.name ?? '',
			model?.primaryFile?.filePath ?? server.modelPath,
		];

		return searchableParts.some(part => part?.toLowerCase().includes(q));
	}

	// Filter and sort servers
	const filteredServers = useMemo(() => {
		let result = [...servers];

		// Apply search filter
		if (searchQuery.trim()) {
			result = result.filter(s => matchesSearch(s, searchQuery));
		}

		// Apply running-only filter
		if (runningOnly) {
			result = result.filter(s => s.status === EServerStatus.RUNNING);
		}

		// Apply sorting
		result.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'name':
					comparison = a.serverName.localeCompare(b.serverName);
					break;
				case 'recency':
					// Fabricate startedAt for loading servers (use current time)
					const aEffective = a.status === EServerStatus.LOADING ? Date.now() : (a.startedAt ?? 0);
					const bEffective = b.status === EServerStatus.LOADING ? Date.now() : (b.startedAt ?? 0);
					comparison = bEffective - aEffective; // newer first by default (desc)
					break;
				case 'backend': {
					const backendA = a.backendGroupId ? groupMap.get(a.backendGroupId)?.name ?? 'Unknown' : backendMap.get(a.backendId!)?.name ?? 'Unknown';
					const backendB = b.backendGroupId ? groupMap.get(b.backendGroupId)?.name ?? 'Unknown' : backendMap.get(b.backendId!)?.name ?? 'Unknown';
					comparison = backendA.localeCompare(backendB);
					break;
				}
			}

			return sortOrder === 'asc' ? comparison : -comparison;
		});

		return result;
	}, [servers, searchQuery, sortField, sortOrder, runningOnly, backendMap]);

	// Get device display as "name (id)" format
	function getDeviceName(server: IServer): string {
		let backend: IBackend | undefined;
		if (server.backendGroupId) {
			const group = groupMap.get(server.backendGroupId);
			if (group) backend = backendMap.get(group.activeBackendId);
		} else {
			backend = backendMap.get(server.backendId || '');
		}
		const device = backend?.detectedDevices.find(d => d.id === server.params.device);
		if (device) {
			return `${device.name} (${device.id})`;
		}
		if (server.params.device) {
			return server.params.device;
		}
		const firstDevice = backend?.detectedDevices[0];
		return firstDevice ? `${firstDevice.name} (${firstDevice.id})` : 'Default';
	}

	// Get model's max context length
	function getModelMaxContext(server: IServer): number | null {
		const model = modelByPath.get(server.modelPath);
		return model?.primaryFile?.metadata?.contextLength ?? null;
	}

	const [showLaunch, setShowLaunch] = useState(false);
	const [logsServerId, setLogsServerId] = useState<string | null>(null);
	const [editingServerId, setEditingServerId] = useState<string | null>(null);
	const [saveCheckpointServerId, setSaveCheckpointServerId] = useState<string | null>(null);
	const [loadCheckpointServerId, setLoadCheckpointServerId] = useState<string | null>(null);
	const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
	const [removingAlias, setRemovingAlias] = useState<{ serverId: string; alias: string } | null>(null);
	const [addingAlias, setAddingAlias] = useState<{ serverId: string; serverName: string } | null>(null);
	const [newAliasValue, setNewAliasValue] = useState('');
	const logsServer = servers.find(s => s.id === logsServerId);
	const editingServer = servers.find(s => s.id === editingServerId);
	const deletingServer = servers.find(s => s.id === deletingServerId);

	const stopMut = useMutation<string, IServer>(useCallback((id: string) => stopServer(id), []));
	const restartMut = useMutation<string, IServer>(useCallback((id: string) => restartServer(id), []));
	const removeMut = useMutation<string, null>(useCallback((id: string) => removeServer(id), []));
	const updateServerMut = useMutation<[string, Partial<Pick<IServer, 'serverAlias'>>], IServer>(
		useCallback(([id, data]) => updateServer(id, data, false), [])
	);

	const handleStop = async (id: string) => { await stopMut.mutate(id); };
	const handleRestart = async (id: string) => { await restartMut.mutate(id); };
	const handleRemove = async (id: string) => { await removeMut.mutate(id); setDeletingServerId(null); };
	const confirmDelete = (id: string) => { setDeletingServerId(id); };

	// Handle removing an alias from a server
	const handleRemoveAlias = async () => {
		if (!removingAlias) return;
		const { serverId, alias } = removingAlias;
		const server = servers.find(s => s.id === serverId);
		if (!server) return;

		// Clear sticky route for this alias if proxy is using it
		await clearStickyRoute(alias).catch(() => {});

		// Remove the alias from the server without relaunching
		const newAliases = (server.serverAlias ?? []).filter(a => a !== alias);
		await updateServerMut.mutate([serverId, { serverAlias: newAliases }]);
		setRemovingAlias(null);
	};

	const confirmRemoveAlias = (serverId: string, alias: string) => {
		setRemovingAlias({ serverId, alias });
	};

	// Handle adding a new alias to a server (supports comma-separated values)
	const handleAddAlias = async () => {
		if (!addingAlias || !newAliasValue.trim()) return;
		const { serverId } = addingAlias;
		const server = servers.find(s => s.id === serverId);
		if (!server) return;

		const existingAliases = server.serverAlias ?? [];
		const newAliasesToAdd: string[] = [];

		// Split by comma and process each alias
		newAliasValue.split(',').forEach(part => {
			const alias = part.trim();
			if (alias && !existingAliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
				newAliasesToAdd.push(alias);
			}
		});

		if (newAliasesToAdd.length > 0) {
			const updatedAliases = [...existingAliases, ...newAliasesToAdd];
			await updateServerMut.mutate([serverId, { serverAlias: updatedAliases }]);
		}

		setAddingAlias(null);
		setNewAliasValue('');
	};

	const openAddAliasPopover = (serverId: string, serverName: string) => {
		setAddingAlias({ serverId, serverName });
		setNewAliasValue('');
	};

	const closeAddAliasPopover = () => {
		setAddingAlias(null);
		setNewAliasValue('');
	};

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${servers.filter(s => s.status === EServerStatus.RUNNING).length} / ${servers.length} Running`}
				icon={<Server size={20} />}
				actions={
					<HStack gap="3">
						<InputGroup startElement={<Search size={14} color="rgba(255, 255, 255, 0.3)" />} w="200px">
							<Input
								placeholder="Search servers..."
								size="sm"
								bg="rgba(255, 255, 255, 0.03)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="rgba(255, 255, 255, 0.7)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
								_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
							/>
						</InputGroup>
						<HStack gap="3">
							{(() => {
								const sortCollection = createListCollection({
									items: (Object.keys(FIELD_LABELS) as TSortField[]).map(f => ({ value: f, label: FIELD_LABELS[f] })),
									itemToString: (item) => item.label,
								});
								return (
									<Combobox.Root
										collection={sortCollection}
										value={[sortField]}
										onValueChange={(details) => {
											const val = details.value?.[0] as TSortField;
											if (val) handleSortChange(val, sortOrder);
										}}
									>
										<Combobox.Control>
											<Combobox.Trigger asChild>
												<Button
													variant="outline"
													size="sm"
													w="150px"
													justifyContent="space-between"
													bg="rgba(255, 255, 255, 0.03)"
													borderColor="rgba(255, 255, 255, 0.08)"
													color="rgba(255, 255, 255, 0.7)"
													fontSize="13px"
													borderRadius="lg"
												>
													{FIELD_LABELS[sortField]}
													<ChevronDown size={14} />
												</Button>
											</Combobox.Trigger>
										</Combobox.Control>
										<Portal>
											<Combobox.Positioner>
												<Combobox.Content
													maxH="200px" overflowY="auto"
													bg="#181818" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
															_highlighted={{ bg: '#181818' }}
														>
															<Text fontSize="12px" color="#e4e4e7">{item.label}</Text>
															<Combobox.ItemIndicator />
														</Combobox.Item>
													))}
												</Combobox.Content>
											</Combobox.Positioner>
										</Portal>
									</Combobox.Root>
								);
							})()}
							<Button
								size="sm"
								variant="outline"
								bg="rgba(255, 255, 255, 0.03)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="rgba(255, 255, 255, 0.5)"
								borderRadius="md"
								_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
						<Switch.Root label="Show only running servers" checked={runningOnly} onCheckedChange={(details) => setRunningOnly(details.checked)} color={runningOnly ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: runningOnly ? '#3b86d6' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={runningOnly ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
								Running only
							</Switch.Label>
						</Switch.Root>
					</HStack>
				}
				actionsRight={
					<Button
						size="sm"
						bgGradient="to-r"
						gradientFrom="#3381ff"
						gradientTo="#5b6af5"
						color="white"
						_hover={{ opacity: 0.9, transform: 'translateY(-1px)', shadow: '0 4px 20px rgba(51, 129, 255, 0.3)' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="600"
						transition="all 0.2s ease"
						onClick={() => setShowLaunch(true)}
						display={"flex"}
						flexDirection={"row"}
						alignItems={"center"}
						justifyContent={"center"}
					>
						<Play size={15} />
						Launch Server
					</Button>
				}
			/>

			<Box p="4">
				{filteredServers.length === 0 ? (
					<Flex
						h="300px" alignItems="center" justifyContent="center"
						borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" borderRadius="xl" borderStyle="dashed"
					>
						<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
							<Server size={40} />
							<Text fontSize="14px">{servers.length === 0 ? 'No servers running' : 'No matching servers'}</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.15)">{servers.length === 0 ? 'Click "Launch Server" to get started' : 'Try adjusting your filters or search query'}</Text>
						</VStack>
					</Flex>
				) : (
					<VStack align="stretch" gap="4">
						{filteredServers.map(server => {
							const isRunning = server.status === EServerStatus.RUNNING;
							const isLoading = server.status === EServerStatus.LOADING;

							return (
								<Card
									key={server.id}
									p="3"
									hasGradient={isRunning || isLoading}
									gradientFrom={isRunning ? "rgba(52, 211, 153, 0.05)" : "rgba(251, 191, 36, 0.025)"}
									gradientTo="transparent"
									borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : isLoading ? 'rgba(251, 191, 36, 0.3)' : undefined}
								>
									<VStack align="stretch" gap="2.5">
										<Flex justify="space-between" align="start">
											<HStack gap="3" pr="3">
												<Flex
													w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
													position="relative"
													bg={isRunning ? 'rgba(52, 211, 153, 0.06)' : isLoading ? 'rgba(251, 191, 36, 0.06)' : 'rgba(255, 255, 255, 0.04)'}
													borderWidth="1px"
													borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : isLoading ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
												>
													<Server size={18} color={isRunning ? '#34d399' : isLoading ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)'} />
													{/* {isRunning && <Box position="absolute" top="-1px" right="-1px" w="8px" h="8px" borderRadius="full" bg="#34d399" shadow="0 0 8px #34d399" />} */}
												</Flex>
												<Box>
													<HStack gap="3" alignItems="center" flexWrap="wrap">
														<HoverCard.Root size="sm" openDelay={150}>
															<HoverCard.Trigger asChild>
																<Text fontSize="13px" fontWeight="600" color="#d0d0d0" cursor="help">{server.serverName}</Text>
															</HoverCard.Trigger>
															<Portal>
																<HoverCard.Positioner>
																	<HoverCard.Content
																		bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
																		borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="3"
																		maxW="500px"
																	>
																		<VStack align="stretch" gap="2">
																			<Box
																				fontSize="10px" fontFamily='"Geist Mono", monospace' color="rgba(255, 255, 255, 0.7)"
																				bg="rgba(255, 255, 255, 0.03)" borderRadius="md" p="2.5"
																				whiteSpace="pre-wrap" wordBreak="break-all" lineHeight="1.4"
																			>
																				{server.launchCommand}
																			</Box>
																		</VStack>
																	</HoverCard.Content>
																</HoverCard.Positioner>
															</Portal>
														</HoverCard.Root>
														<StatusBadge status={server.status as EServerStatus} port={server.port} />
														{server.serverAlias && server.serverAlias.length > 0 && (
															<>
																{server.serverAlias.map(alias => (
																	<Badge key={alias} px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(99, 102, 241, 0.15)" color="#a5b4fc" borderWidth="1px" borderColor="rgba(99, 102, 241, 0.3)">
																		{alias}
																		<Button
																			size="xs"
																			variant="ghost"
																			p="0"
																			minW="auto"
																			h="14px"
																			w="14px"
																			ml="2"
																			color="#a5b4fc"
																			_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)' }}
																			borderRadius="md"
																			onClick={(e) => { e.stopPropagation(); confirmRemoveAlias(server.id, alias); }}
																		>
																			<X size={9} />
																		</Button>
																	</Badge>
																))}
															</>
														)}
														<Popover.Root lazyMount unmountOnExit open={addingAlias?.serverId === server.id} onOpenChange={(details) => { if (!details.open) closeAddAliasPopover(); }}>
															<Popover.Trigger asChild>
																<Badge px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(99, 102, 241, 0.1)" color="#a5b4fc" borderWidth="1px" borderColor="rgba(99, 102, 241, 0.25)" cursor="pointer" onClick={(e) => { e.stopPropagation(); openAddAliasPopover(server.id, server.serverName); }}>
																	<Plus size={10} />
																</Badge>
															</Popover.Trigger>
															<Portal>
																<Popover.Positioner>
																	<Popover.Content maxW="320px" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)">
																		<Popover.Arrow />
																		<Popover.Body p="4">
																			<Text fontSize="12px" fontWeight="medium" color="#e4e4e7" mb="3">Add alias for "{server.serverName}"</Text>
																			<HStack gap="2">
																				<Input
																					value={newAliasValue}
																					onChange={(e) => setNewAliasValue(e.target.value)}
																					onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
																					placeholder="Enter comma separated aliases..."
																					size="sm"
																					bg="rgba(255, 255, 255, 0.03)"
																					borderColor="rgba(255, 255, 255, 0.1)"
																					color="#e4e4e7"
																					fontSize="12px"
																					_placeholder={{ color: 'rgba(255, 255, 255, 0.3)' }}
																				/>
																				<Button
																					size="sm"
																					bgGradient="to-r"
																					gradientFrom="#3381ff"
																					gradientTo="#5b6af5"
																					color="white"
																					fontSize="12px"
																					onClick={handleAddAlias}
																				>
																					Add
																				</Button>
																			</HStack>
																		</Popover.Body>
																	</Popover.Content>
																</Popover.Positioner>
															</Portal>
														</Popover.Root>
														{isRunning && (
															<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
																<Clock size={11} />
																<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
															</HStack>
														)}
													</HStack>
													{/* Details row */}
													<HStack gap="2.5" flexWrap="wrap" mt="1.5">
														{(() => {
															const backend = backendMap.get(server.backendId || '');
															const group = groupMap.get(server.backendGroupId || '');
															const model = modelByPath.get(server.modelPath);
															const draftModel = server.params.specDecode?.draftModelPath ? modelByPath.get(server.params.specDecode.draftModelPath) : null;
															const deviceName = getDeviceName(server);
															const modelMaxCtx = getModelMaxContext(server);
															const configuredCtx = server.params.contextSize;
															const displayCtx = configuredCtx === 0 ? 
																(modelMaxCtx ? formatCount(modelMaxCtx) : 'auto') : formatCount(configuredCtx);
															const backendName = group?.name ? `${group.name} (${backendMap.get(group.activeBackendId)?.name ?? 'Unknown'})` : backend?.name ?? "Backend Not Found!";

															return (
																<>
																	<HStack gap="1">
																		<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? "Model Not Found!"} />
																		{model?.mmprojFile && server.useMultiModal && (
																			<Icon color="#ecbf42" boxSize="14px" ml="1" mr="1"><FaRegEye /></Icon>
																		)}
																		{model?.mmprojFile && !server.useMultiModal && (
																			<Icon color="#ec4242" boxSize="14px" ml="1" mr="1"><GoEyeClosed /></Icon>
																		)}
																		{model?.mmprojFile && server.useMultiModal && (
																			<Icon color="#ec4242" boxSize="14px" ml="1" mr="1"><LuSaveOff /></Icon>
																		)}
																		{model?.primaryFile?.metadata?.quantType && (
																			<Badge
																				px="1.5" py="0.25" borderRadius="md" fontSize="10px"
																				fontFamily='"Geist Mono", monospace'
																				bg={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 15%, transparent)`}
																				color={QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.5)'}
																				borderWidth="1px"
																				borderColor={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 30%, transparent)`}
																			>
																				{model.primaryFile.metadata.quantType}
																			</Badge>
																		)}
																	</HStack>
																	{server.params.specDecode?.enabled && draftModel && (
																		<StatPill icon={<Sparkles size={12} />} label="Draft" value={draftModel.name} />
																	)}
																	<StatPill icon={<Blocks size={12} />} label="Backend" value={backendName} />
																	<StatPill icon={<Cpu size={12} />} label="Device" value={deviceName} />
																	<StatPill icon={<FaBookOpen size={12} />} label="Context" value={`${displayCtx}`} />
																</>
															);
														})()}
													</HStack>
													{server.error && (
														<Text fontSize="11px" color="#fb7185" lineClamp={1} mt="0.5">{server.error}</Text>
													)}
												</Box>
											</HStack>

											<HStack gap="1" my="auto" pl="3">
												{/* Load checkpoint */}
												{(!modelByPath.get(server.modelPath)?.mmprojFile || !server.useMultiModal) && <Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setLoadCheckpointServerId(server.id)}>
													<Zap size={14} />
												</Button>}
												{/* Save checkpoint (running only) */}
												{isRunning && (!modelByPath.get(server.modelPath)?.mmprojFile || !server.useMultiModal) && (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setSaveCheckpointServerId(server.id)}>
														<Save size={14} />
													</Button>
												)}
												{/* Separator */}
												<Box w="1px" h="16px" bg="rgba(255, 255, 255, 0.08)" my="auto" />
												{/* Run/Restart */}
												{!isRunning && !isLoading && (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={() => handleRestart(server.id)}>
														<Play size={14} />
													</Button>
												)}
												{(isRunning || isLoading) && (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={() => handleRestart(server.id)}>
														<RotateCcw size={14} />
													</Button>
												)}

												{/* Terminal */}
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.08)' }} borderRadius="md" onClick={() => setLogsServerId(server.id)}>
													<Terminal size={14} />
												</Button>

												{/* Edit */}
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setEditingServerId(server.id)}>
													<Edit size={14} />
												</Button>

												{/* Separator */}
												<Box w="1px" h="16px" bg="rgba(255, 255, 255, 0.08)" my="auto" />

												{/* Delete/Stop */}
												{(isRunning || isLoading) ? (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => handleStop(server.id)}>
														<Square size={14} />
													</Button>
												) : (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => confirmDelete(server.id)}>
														<Trash2 size={14} />
													</Button>
												)}
											</HStack>
										</Flex>
										{(() => {
											const slotsState = serverSlots[server.id] ?? null;
											if (!slotsState || slotsState.slots.length === 0) return null;
											return (
												<HStack gap="2.5" flexWrap="wrap" style={{ marginLeft: "50px" }}>
													{slotsState.slots.map(slot => (
														<SlotPill
															key={slot.slotId}
															slot={slot}
															metadata={slotsState.metadata[slot.slotId] ?? null}
														/>
													))}
												</HStack>
											);
										})()}
									</VStack>
								</Card>
							);
						})}
					</VStack>
				)}
			</Box>

			{showLaunch && (
				<LaunchServerDialog onClose={() => setShowLaunch(false)} />
			)}

			{logsServer && (
				<ServerLogs serverId={logsServer.id} serverName={logsServer.serverName} onClose={() => setLogsServerId(null)} />
			)}

			{editingServer && (
				<LaunchServerDialog
					onClose={() => setEditingServerId(null)}
					editMode={{
						serverId: editingServer.id,
						backendId: editingServer.backendId!,
						backendGroupId: editingServer.backendGroupId,
						modelPath: editingServer.modelPath,
						serverName: editingServer.serverName,
						serverAlias: editingServer.serverAlias ?? [],
						params: editingServer.params,
						autoLaunch: editingServer.autoLaunch ?? false,
						autoSaveCheckpointOnStop: editingServer.autoSaveCheckpointOnStop ?? false,
						autoLoadCheckpointOnStart: editingServer.autoLoadCheckpointOnStart ?? false,
						useMultiModal: editingServer.useMultiModal ?? false,
						useRecommendedInferenceParams: editingServer.useRecommendedInferenceParams ?? false,
					}}
				/>
			)}
			{saveCheckpointServerId && serversRecord[saveCheckpointServerId] && (
				<SaveCheckpointDialog
					server={serversRecord[saveCheckpointServerId]!}
					isOpen={true}
					onClose={() => setSaveCheckpointServerId(null)}
				/>
			)}
			{loadCheckpointServerId && serversRecord[loadCheckpointServerId] && (
				<LoadCheckpointDialog
					server={serversRecord[loadCheckpointServerId]!}
					isOpen={true}
					onClose={() => setLoadCheckpointServerId(null)}
				/>
			)}

			{deletingServer && (
				<ConfirmDialog
					title="Delete Server?"
					message={`This will remove "${deletingServer.serverName}" from your configuration. The server process will not be affected.`}
					isOpen={true}
					isLoading={removeMut.loading}
					onCancel={() => setDeletingServerId(null)}
					onConfirm={() => handleRemove(deletingServer.id)}
				/>
			)}

			{removingAlias && (
				<ConfirmDialog
					title="Remove Alias?"
					message={`This will remove the alias "${removingAlias.alias}" from the server. This won't affect the running server.`}
					isOpen={true}
					isLoading={updateServerMut.loading}
					onCancel={() => setRemovingAlias(null)}
					onConfirm={handleRemoveAlias}
				/>
			)}
		</Box>
	);
});
