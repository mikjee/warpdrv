import { Box, Text, HStack, VStack, Flex, Button, Spinner, Badge, Input, Switch, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import {
	Play, Square, RotateCcw, Plus, Server, Clock, Trash2,
	Activity, Gauge, Cpu, Blocks, Terminal, Edit, Search, ChevronDown, ArrowUpAZ, ArrowDownZA
} from 'lucide-react';
import { FaBrain, FaBookOpen } from 'react-icons/fa6';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { VramBar } from '../components/VramBar';
import { LaunchServerDialog } from '../components/dialogs/LaunchServerDialog';
import { ServerLogs } from '../components/dialogs/ServerLogs';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { fetchServers, fetchBackends, fetchModels, stopServer, restartServer, removeServer, fetchSettings, updateSettings } from '../api/services';
import type { IServer, IBackend, IModel, TSortField, TSortOrder } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

function formatUptime(startedAt: number | null): string {
	if (!startedAt) return '-';
	const ms = Date.now() - startedAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h ${mins % 60}m`;
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="2.5" py="1.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)">
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)">{label}</Text>
			<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}

const FIELD_LABELS: Record<TSortField, string> = {
	name: 'Name',
	recency: 'Recently Used',
	backend: 'Backend',
};

function toggleSortOrder(order: TSortOrder): TSortOrder {
	return order === 'asc' ? 'desc' : 'asc';
}

export function ServersPage() {
	const fetcher = useCallback(() => fetchServers(), []);
	const { data: servers, loading, refetch } = useListQuery<IServer>(fetcher, { pollInterval: 3000 });

	const { data: backends } = useListQuery<IBackend>(useCallback(() => fetchBackends(), []), { pollInterval: 0 });
	const { data: models } = useListQuery<IModel>(useCallback(() => fetchModels(), []), { pollInterval: 0 });

	// Filter and sort state
	const [searchQuery, setSearchQuery] = useState('');
	const [sortField, setSortField] = useState<TSortField>('name');
	const [sortOrder, setSortOrder] = useState<TSortOrder>('asc');
	const [runningOnly, setRunningOnly] = useState(false);

	// Load persisted sort settings on mount
	useEffect(() => {
		fetchSettings().then((result) => {
			if (result.ok && result.data) {
				setSortField(result.data.serversSortField);
				setSortOrder(result.data.serversSortOrder);
			}
		});
	}, []);

	// Save sort settings when they change
	useEffect(() => {
		updateSettings({ serversSortField: sortField, serversSortOrder: sortOrder });
	}, [sortField, sortOrder]);

	// Build lookup maps
	const backendMap = new Map(backends.map(b => [b.id, b]));
	const modelByPath = new Map<string, IModel>();
	models.forEach(m => {
		if (m.primaryFile) {
			modelByPath.set(m.primaryFile.filePath, m);
		}
	});

	// Fuzzy search matching against multiple fields
	function matchesSearch(server: IServer, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		const backend = backendMap.get(server.backendId);
		const model = modelByPath.get(server.modelPath);

		// Search against: serverName, aliases, backend name, device, model name/path
		const searchableParts = [
			server.serverName,
			...(server.serverAlias ?? []),
			backend?.name ?? '',
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
					const aStarted = a.startedAt ?? 0;
					const bStarted = b.startedAt ?? 0;
					comparison = bStarted - aStarted; // newer first by default (desc)
					break;
				case 'backend': {
					const backendA = backendMap.get(a.backendId)?.name ?? '';
					const backendB = backendMap.get(b.backendId)?.name ?? '';
					comparison = backendA.localeCompare(backendB);
					break;
				}
			}

			return sortOrder === 'asc' ? comparison : -comparison;
		});

		return result;
	}, [servers, searchQuery, sortField, sortOrder, runningOnly, backendMap]);

	// Get backend type from detected devices
	function getBackendType(backendId: string): string {
		const backend = backendMap.get(backendId);
		if (!backend || backend.detectedDevices.length === 0) return 'Unknown';
		const types = new Set(backend.detectedDevices.map(d => d.backendType));
		return Array.from(types).join(' + ');
	}

	// Get device display as "name (id)" format
	function getDeviceName(server: IServer): string {
		const backend = backendMap.get(server.backendId);
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
	const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
	const logsServer = servers.find(s => s.id === logsServerId);
	const editingServer = servers.find(s => s.id === editingServerId);
	const deletingServer = servers.find(s => s.id === deletingServerId);

	const stopMut = useMutation<string, IServer>(useCallback((id: string) => stopServer(id), []));
	const restartMut = useMutation<string, IServer>(useCallback((id: string) => restartServer(id), []));
	const removeMut = useMutation<string, null>(useCallback((id: string) => removeServer(id), []));

	const handleStop = async (id: string) => { await stopMut.mutate(id); await refetch(); };
	const handleRestart = async (id: string) => { await restartMut.mutate(id); await refetch(); };
	const handleRemove = async (id: string) => { await removeMut.mutate(id); await refetch(); setDeletingServerId(null); };
	const confirmDelete = (id: string) => { setDeletingServerId(id); };

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${servers.filter(s => s.status === EServerStatus.RUNNING).length} running`}
				icon={<Play size={20} />}
				actions={
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
					>
						<Plus size={15} />
						Launch Server
					</Button>
				}
			/>

			{/* Subheader: Search, Sort, Running Only */}
			<Box px="8" py="4" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
				<Flex gap="4" align="center" flexWrap="wrap">
					{/* Search Input */}
					<Box flex="1" minW="200px" maxW="300px">
						<InputGroup startElement={<Search size={14} color="rgba(255, 255, 255, 0.3)" />}>
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
					</Box>

					{/* Sort Field Dropdown + Order Buttons */}
					<HStack gap="1.5">
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
										if (val) setSortField(val);
									}}
								>
									<Combobox.Control>
										<Combobox.Trigger asChild>
											<Button
												variant="outline"
												size="sm"
												w="130px"
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
												bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
												borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
											>
												{sortCollection.items.map((item) => (
													<Combobox.Item
														key={item.value}
														item={item}
														px="3" py="2" borderRadius="md" cursor="pointer"
														_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
														_highlighted={{ bg: 'rgba(51, 129, 255, 0.08)' }}
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
						<HStack gap="0.5" flexShrink={0}>
							<Button
								size="sm"
								variant="ghost"
								p="1" minW="auto"
								color={sortOrder === 'asc' ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}
								bg={sortOrder === 'asc' ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
								_hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }}
								borderRadius="md"
								onClick={() => setSortOrder(toggleSortOrder(sortOrder))}
							>
								<ArrowUpAZ size={14} />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								p="1" minW="auto"
								color={sortOrder === 'desc' ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}
								bg={sortOrder === 'desc' ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
								_hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }}
								borderRadius="md"
								onClick={() => setSortOrder(toggleSortOrder(sortOrder))}
							>
								<ArrowDownZA size={14} />
							</Button>
						</HStack>
					</HStack>

					{/* Running Only Toggle */}
					<Switch.Root label="Show only running servers" checked={runningOnly} onCheckedChange={(details) => setRunningOnly(details.checked)} color={runningOnly ? '#34d399' : 'rgba(255, 255, 255, 0.4)'}>
						<Switch.HiddenInput />
						<Switch.Control />
						<Switch.Label ml="2" fontSize="13px" color={runningOnly ? '#34d399' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
							Running only
						</Switch.Label>
					</Switch.Root>

					{/* Results count */}
					<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>
						{filteredServers.length} {filteredServers.length === 1 ? 'server' : 'servers'}
					</Text>
				</Flex>
			</Box>

			<Box p="8">
				{loading && filteredServers.length === 0 ? (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
					</Flex>
				) : filteredServers.length === 0 ? (
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
								<Card key={server.id}>
									<VStack align="stretch" gap="4">
										<Flex justify="space-between" align="start">
											<HStack gap="3">
												<Flex
													w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
													position="relative"
													bg={isRunning ? 'rgba(52, 211, 153, 0.06)' : 'rgba(255, 255, 255, 0.04)'}
													borderWidth="1px"
													borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
												>
													<Server size={18} color={isRunning ? '#34d399' : 'rgba(255, 255, 255, 0.3)'} />
													{isRunning && <Box position="absolute" top="-1px" right="-1px" w="8px" h="8px" borderRadius="full" bg="#34d399" shadow="0 0 8px #34d399" />}
												</Flex>
												<Box>
													<HStack gap="2" alignItems="center">
														<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{server.serverName}</Text>
														{server.serverAlias && server.serverAlias.length > 0 && (
															<>
																{server.serverAlias.map(alias => (
																	<Badge key={alias} px="1.5" py="0.25" borderRadius="md" fontSize="10px" fontFamily='"Geist Mono", monospace' bg="rgba(99, 102, 241, 0.15)" color="#a5b4fc" borderWidth="1px" borderColor="rgba(99, 102, 241, 0.3)">{alias}</Badge>
																))}
															</>
														)}
													</HStack>
													<HStack gap="3" mt="0.5">
														<StatusBadge status={server.status as EServerStatus} port={server.port} />
														{server.error && (
															<>
																<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">|</Text>
																<Text fontSize="11px" color="#fb7185" lineClamp={1}>{server.error}</Text>
															</>
														)}
														{isRunning && (
															<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
																<Clock size={11} />
																<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
															</HStack>
														)}
													</HStack>
												</Box>
											</HStack>

											<HStack gap="1.5">
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setEditingServerId(server.id)}>
													<Edit size={14} />
												</Button>
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.08)' }} borderRadius="md" onClick={() => setLogsServerId(server.id)}>
													<Terminal size={14} />
												</Button>
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

										{/* Details row */}
										<HStack gap="2" flexWrap="wrap">
											{(() => {
												const backend = backendMap.get(server.backendId);
												const model = modelByPath.get(server.modelPath);
												const backendType = getBackendType(server.backendId);
												const deviceName = getDeviceName(server);
												const modelMaxCtx = getModelMaxContext(server);
												const configuredCtx = server.params.contextSize;
												const displayCtx = configuredCtx === 0 ? (modelMaxCtx ?? 'auto') : configuredCtx;

												return (
													<>
														<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? server.serverName} />
														<StatPill icon={<Blocks size={12} />} label="Backend" value={backend?.name ?? server.backendId} />
														<StatPill icon={<Gauge size={12} />} label="Type" value={backendType} />
														<StatPill icon={<Cpu size={12} />} label="Device" value={deviceName} />
														<StatPill icon={<FaBookOpen size={12} />} label="Context" value={`${displayCtx}`} />
													</>
												);
											})()}
										</HStack>

										{/* Stats */}
										{server.stats && server.stats.tokensGenerated != null && (
											<HStack gap="2" flexWrap="wrap">
												<StatPill icon={<Activity size={12} />} label="Slots" value={`${server.stats.slotsProcessing}/${server.stats.slotsProcessing + server.stats.slotsIdle}`} />
												{(server.stats.slots ?? []).map(slot => {
													const isPrompt = slot.state === 'processing' && slot.tokensGenerated === 0;
													const isGen = slot.state === 'processing' && slot.tokensGenerated > 0;
													const color = isPrompt ? '#fbbf24' : isGen ? '#3381ff' : 'rgba(255, 255, 255, 0.25)';
													const label = isPrompt ? 'prompt' : isGen ? `gen ${slot.tokensGenerated}` : 'idle';
													return (
														<Badge key={slot.id} px="2" py="0.5" borderRadius="md" fontSize="10px" fontFamily='"Geist Mono", monospace'
															bg={`color-mix(in srgb, ${color} 10%, transparent)`}
															color={color}
															borderWidth="1px"
															borderColor={`color-mix(in srgb, ${color} 20%, transparent)`}
														>
															S{slot.id}: {label}
														</Badge>
													);
												})}
											</HStack>
										)}
									</VStack>
								</Card>
							);
						})}
					</VStack>
				)}
			</Box>

			{showLaunch && (
				<LaunchServerDialog onClose={() => { setShowLaunch(false); refetch(); }} />
			)}

			{logsServer && (
				<ServerLogs serverId={logsServer.id} serverName={logsServer.serverName} onClose={() => setLogsServerId(null)} />
			)}

			{editingServer && (
				<LaunchServerDialog
					onClose={() => setEditingServerId(null)}
					editMode={{
						serverId: editingServer.id,
						backendId: editingServer.backendId,
						modelPath: editingServer.modelPath,
						mmprojPath: editingServer.mmprojPath ?? null,
						serverName: editingServer.serverName,
						serverAlias: editingServer.serverAlias ?? [],
						params: editingServer.params,
					}}
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
		</Box>
	);
}
