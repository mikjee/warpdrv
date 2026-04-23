import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner, Input, Collapsible, SimpleGrid, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, CheckCircle, Trash2, Edit, RefreshCw, AlertCircle, Layers, ChevronDown, ChevronRight, Search, ArrowUpAZ, ArrowDownZA } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../hooks/useDependantState';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useMutation } from '../hooks/useQuery';
import { useStore } from '../store';
import { deleteBackend, validateBackend, createBackendGroup, deleteBackendGroup, activateBackendInGroup, restartServer, updateBackendGroup, updateSettings } from '../api/services';
import { BackendDialog } from '../components/dialogs/BackendDialog';
import { BackendGroupDialog } from '../components/dialogs/BackendGroupDialog';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { ActivateBackendDialog } from '../components/dialogs/ActivateBackendDialog';
import { DeviceCard } from '../components/DeviceCard';
import type { IBackend, IBackendGroup, IServer, IDevice, TBackendSortField } from '@warpcore/shared';
import { EValidationStatus, EServerStatus } from '@warpcore/shared';

const STATUS_COLORS: Record<string, string> = {
	[EValidationStatus.VALID]: '#34d399',
	[EValidationStatus.INVALID]: '#fb7185',
	[EValidationStatus.IDLE]: 'rgba(255, 255, 255, 0.3)',
	[EValidationStatus.CHECKING]: '#fbbf24',
};

const FIELD_LABELS: Record<TBackendSortField, string> = {
	name: 'Name',
	createdAt: 'Creation date',
	updatedAt: 'Update date',
};

export function BackendsPage() {
	const backendsRecord = useStore((s) => s.backends);
	const backendGroupsRecord = useStore((s) => s.backendGroups);

	const backends = useMemo(() => Object.values(backendsRecord), [backendsRecord]);
	const groups = useMemo(() => Object.values(backendGroupsRecord), [backendGroupsRecord]);

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showAddGroup, setShowAddGroup] = useState(false);
	const [editingBackend, setEditingBackend] = useState<IBackend | null>(null);
	const [editingGroup, setEditingGroup] = useState<IBackendGroup | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
	const [validatingId, setValidatingId] = useState<string | null>(null);
	const [backendsExpanded, setBackendsExpanded] = useState(true);
	const [groupsExpanded, setGroupsExpanded] = useState(true);
	const [activatingBackend, setActivatingBackend] = useState<{ groupId: string; newBackendId: string } | null>(null);
	const [expandedBackends, setExpandedBackends] = useState<Record<string, boolean>>({});

	// Search and sort
	const [searchQuery, setSearchQuery] = useState('');
	const settings = useStore(s => s.settings);
	const [sortField, setSortField] = useDependantState(settings.backendsSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.backendsSortOrder);

	// Save sort settings when they change
	const handleSortChange = useCallback((field: TBackendSortField, order: 'asc' | 'desc') => {
		setSortField(field);
		setSortOrder(order);
		updateSettings({ backendsSortField: field, backendsSortOrder: order });
	}, []);

	const serversRecord = useStore((s) => s.servers);
	const servers = useMemo(() => Object.values(serversRecord), [serversRecord]);

	const devices = useStore((s) => s.devices);

	const devicesByBackend = useMemo(() => {
		const map = new Map<string, IDevice[]>();
		for (const backend of backends) {
			map.set(backend.id, devices.filter(d => d.backendId === backend.id));
		}
		return map;
	}, [backends, devices]);

	const totalServersByBackend = useMemo(() => {
		const map = new Map<string, number>();
		for (const backend of backends) {
			map.set(backend.id, 0);
		}
		for (const server of servers) {
			let backendId: string | null = null;
			if (server.backendId) {
				backendId = server.backendId;
			} else if (server.backendGroupId) {
				const group = backendGroupsRecord[server.backendGroupId];
				if (group) {
					backendId = group.activeBackendId;
				}
			}
			if (backendId && map.has(backendId)) {
				map.set(backendId, map.get(backendId)! + 1);
			}
		}
		return map;
	}, [backends, servers, backendGroupsRecord]);

	const runningServersByBackend = useMemo(() => {
		const map = new Map<string, number>();
		for (const backend of backends) {
			map.set(backend.id, 0);
		}
		for (const server of servers) {
			if (server.status !== EServerStatus.RUNNING) continue;
			let backendId: string | null = null;
			if (server.backendId) {
				backendId = server.backendId;
			} else if (server.backendGroupId) {
				const group = backendGroupsRecord[server.backendGroupId];
				if (group) {
					backendId = group.activeBackendId;
				}
			}
			if (backendId && map.has(backendId)) {
				map.set(backendId, map.get(backendId)! + 1);
			}
		}
		return map;
	}, [backends, servers, backendGroupsRecord]);

	const deleteMut = useMutation<string, null>(
		useCallback((id: string) => deleteBackend(id), [])
	);

	const deleteGroupMut = useMutation<string, null>(
		useCallback((id: string) => deleteBackendGroup(id), [])
	);

	const handleDelete = async (id: string) => {
		await deleteMut.mutate(id);
		setDeletingId(null);
	};

	const confirmDelete = (id: string) => {
		setDeletingId(id);
	};

	const handleDeleteGroup = async (id: string) => {
		await deleteGroupMut.mutate(id);
		setDeletingGroupId(null);
	};

	const confirmDeleteGroup = (id: string) => {
		setDeletingGroupId(id);
	};

	const handleValidate = async (id: string) => {
		setValidatingId(id);
		await validateBackend(id);
		setValidatingId(null);
	};

	const handleActivateBackend = async (groupId: string, backendId: string) => {
		await activateBackendInGroup(groupId, backendId);
	};

	// Fuzzy search matching against multiple fields
	function matchesSearch(backend: IBackend, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		const searchableParts = [
			backend.name,
			backend.path,
			backend.description ?? '',
			...backend.detectedDevices.map(d => d.name),
			...backend.detectedDevices.map(d => d.backendType),
		];
		return searchableParts.some(part => part?.toLowerCase().includes(q));
	}

	function matchesGroupSearch(group: IBackendGroup, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();
		const memberBackends = group.backendIds.map(id => backends.find(b => b.id === id)).filter((b): b is IBackend => !!b);
		const searchableParts = [
			group.name,
			group.description ?? '',
			...memberBackends.map(b => b.name),
		];
		return searchableParts.some(part => part?.toLowerCase().includes(q));
	}

	const filteredAndSortedBackends = useMemo(() => {
		let result = [...backends];
		if (searchQuery.trim()) {
			result = result.filter(backend => matchesSearch(backend, searchQuery));
		}
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'updatedAt':
					comparison = a.updatedAt - b.updatedAt;
					break;
			}
			return sortOrder === 'asc' ? comparison : -comparison;
		});
		return result;
	}, [backends, searchQuery, sortField, sortOrder]);

	const filteredAndSortedGroups = useMemo(() => {
		let result = [...groups];
		if (searchQuery.trim()) {
			result = result.filter(group => matchesGroupSearch(group, searchQuery));
		}
		result.sort((a, b) => {
			let comparison = 0;
			switch (sortField) {
				case 'name':
					comparison = a.name.localeCompare(b.name);
					break;
				case 'createdAt':
					comparison = a.createdAt - b.createdAt;
					break;
				case 'updatedAt':
					comparison = a.updatedAt - b.updatedAt;
					break;
			}
			return sortOrder === 'asc' ? comparison : -comparison;
		});
		return result;
	}, [groups, searchQuery, sortField, sortOrder]);

	const toggleBackend = (id: string) => {
		setExpandedBackends(prev => ({ ...prev, [id]: !prev[id] }));
	};

	const isBackendExpanded = (id: string) => {
		return expandedBackends[id] ?? false;
	};

	return (
		<Box>
			<PageHeader
				title="Llama.cpp"
				subtitle={` ${backends.length} Builds, ${groups.length} Groups`}
				icon={<Blocks size={20} />}
				actions={
					<HStack gap="2">
						<InputGroup startElement={<Search size={14} color="rgba(255, 255, 255, 0.3)" />} w="220px">
							<Input
								placeholder="Search backends and groups"
								size="xs"
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
						<HStack gap="1.5">
							{(() => {
								const sortCollection = createListCollection({
									items: (Object.keys(FIELD_LABELS) as TBackendSortField[]).map(f => ({ value: f, label: FIELD_LABELS[f] })),
									itemToString: (item) => item.label ?? '',
								});
								return (
									<Combobox.Root
										collection={sortCollection}
										value={[sortField]}
										onValueChange={(details) => {
											const val = details.value?.[0] as TBackendSortField;
											if (val) handleSortChange(val, sortOrder);
										}}
									>
										<Combobox.Control>
											<Combobox.Trigger asChild>
												<Button
													variant="outline"
													size="xs"
													w="170px"
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
								size="xs"
								variant="outline"
								bg="rgba(255, 255, 255, 0.03)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="rgba(255, 255, 255, 0.5)"
								p="1" minW="auto"
								borderRadius="md"
								_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
					</HStack>
				}
			/>

			<Box p="4">
				<VStack align="stretch" gap="4">
				{/* Backends Section */}
				<Box borderWidth="1px" borderColor="rgba(255,255,255,0.06)" borderRadius="xl" bg="rgba(255,255,255,0.015)" overflow="hidden">
					<Flex mb="4" px="4" py="3" align="center" justify="space-between" cursor="pointer" onClick={() => setBackendsExpanded(!backendsExpanded)} _hover={{ bg: 'rgba(255,255,255,0.02)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="rgba(255,255,255,0.4)">{backendsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Terminal size={16} color="rgba(255, 255, 255, 0.5)" />
							<Text fontSize="13px" fontWeight="600" color="rgba(255,255,255,0.8)">Backends</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.4)" fontSize="10px" fontWeight="600">{filteredAndSortedBackends.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="rgba(255,255,255,0.5)" _hover={{ bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }} onClick={(e) => { e.stopPropagation(); setShowAddDialog(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={backendsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
							{filteredAndSortedBackends.length === 0 && backends.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Blocks size={40} />
									<Text fontSize="14px">No backends registered</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedBackends.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Blocks size={40} />
									<Text fontSize="14px">No matching backends</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.15)">Try adjusting your search query</Text>
								</VStack>
							</Flex>
						) : (
							<VStack align="stretch" gap="2.5">
								{filteredAndSortedBackends.map(backend => {
									const statusColor = STATUS_COLORS[backend.validation] ?? 'rgba(255, 255, 255, 0.3)';
									const backendDevices = devicesByBackend.get(backend.id) ?? backend.detectedDevices ?? [];
									const deviceCount = backendDevices.length;
									const totalServerCount = totalServersByBackend.get(backend.id) ?? 0;
									const runningServerCount = runningServersByBackend.get(backend.id) ?? 0;
									const hasCollapsibleContent = deviceCount > 0;
									const expanded = isBackendExpanded(backend.id);

									return (
										<Collapsible.Root key={backend.id} open={expanded} onOpenChange={(o) => setExpandedBackends(prev => ({ ...prev, [backend.id]: typeof o === 'boolean' ? o : o.open }))}>
											<Box px="3" py="2" borderRadius="lg" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" cursor={hasCollapsibleContent ? 'pointer' : 'default'} _hover={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} onClick={() => hasCollapsibleContent && toggleBackend(backend.id)}>
												<VStack align="stretch" gap="3">
													<Flex justify="space-between" align="center">
														<HStack gap="3" flex="1">
															<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)">
																<Terminal size={20} color="rgba(255, 255, 255, 0.5)" />
															</Flex>
															<Box flex="1">
																<HStack gap="2" align="center">
																	<Text fontSize="14px" fontWeight="600" color="#cfcfcf">{backend.name}</Text>
																	<HStack gap="1" color={statusColor}>
																		{backend.validation === EValidationStatus.VALID ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
																		<Text fontSize="11px" fontWeight="500">{backend.version || backend.validation}</Text>
																	</HStack>
																	{deviceCount > 0 && (
																		<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="rgba(59, 130, 246, 0.15)" color="#60a5fa" fontSize="10px" fontWeight="600">{deviceCount} Device(s)</Badge>
																	)}
																	{totalServerCount > 0 && (
																		<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="rgba(167, 139, 250, 0.15)" color="#a78bfa" fontSize="10px" fontWeight="600">{totalServerCount} Server(s)</Badge>
																	)}
																	{runningServerCount > 0 && (
																		<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="rgba(52, 211, 153, 0.15)" color="#34d399" border="1px solid #34d399" fontSize="10px" fontWeight="600">{runningServerCount} Running</Badge>
																	)}
																</HStack>
																<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace' lineClamp={1}>{backend.path}</Text>
															</Box>
														</HStack>
														<HStack gap="2">
															{hasCollapsibleContent && (
																<Box color="rgba(255, 255, 255, 0.3)">
																	{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
																</Box>
															)}
															<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); setEditingBackend(backend); }}>
																<Edit size={14} />
															</Button>
															<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); handleValidate(backend.id); }} disabled={validatingId === backend.id}>
																{validatingId === backend.id ? <Spinner size="xs" /> : <RefreshCw size={14} />}
															</Button>
															<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); confirmDelete(backend.id); }}>
																<Trash2 size={14} />
															</Button>
														</HStack>
													</Flex>
												</VStack>
											</Box>
											<Collapsible.Content>
												<Box px="3" pb="3" pt="2" border={"1px solid rgba(255,255,255,0.1)"} borderTop={"none"} borderBottomRadius={"8px"} borderTopRadius={"0"}>
													{deviceCount === 0 ? (
														<Flex h="60px" alignItems="center" justifyContent="center">
															<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">No devices detected for this backend</Text>
														</Flex>
													) : (
														<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="3" mt="2">
															{backendDevices.map((device, idx) => (
																<DeviceCard key={`${device.id}-${idx}`} device={device} />
															))}
														</SimpleGrid>
													)}
												</Box>
											</Collapsible.Content>
										</Collapsible.Root>
									);
								})}
							</VStack>
						)}
					</Box>
						</Collapsible.Content>
					</Collapsible.Root>
				</Box>

				{/* Backend Groups Section */}
				<Box borderWidth="1px" borderColor="rgba(255,255,255,0.06)" borderRadius="xl" bg="rgba(255,255,255,0.015)" overflow="hidden">
					<Flex px="4" py="3" mb="4" align="center" justify="space-between" cursor="pointer" onClick={() => setGroupsExpanded(!groupsExpanded)} _hover={{ bg: 'rgba(255,255,255,0.02)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="rgba(255,255,255,0.4)">{groupsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Layers size={16} color="rgba(255, 255, 255, 0.5)" />
							<Text fontSize="13px" fontWeight="600" color="rgba(255,255,255,0.8)">Groups</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.4)" fontSize="10px" fontWeight="600">{filteredAndSortedGroups.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="rgba(255,255,255,0.5)" _hover={{ bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' }} onClick={(e) => { e.stopPropagation(); setShowAddGroup(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={groupsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
						{filteredAndSortedGroups.length === 0 && groups.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Layers size={40} />
									<Text fontSize="14px">No backend groups</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedGroups.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Layers size={40} />
									<Text fontSize="14px">No matching groups</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.15)">Try adjusting your search query</Text>
								</VStack>
							</Flex>
						) : (
							<Flex gap="2" flexWrap="wrap">
								{filteredAndSortedGroups.map(group => {
									const activeBackend = backends.find(b => b.id === group.activeBackendId);
									const memberBackends = group.backendIds.map(id => backends.find(b => b.id === id)).filter((b): b is IBackend => !!b);

									return (
										<Box key={group.id} w="350px" px="3" py="2" borderRadius="lg" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
											<VStack align="stretch" gap="3">
												<Flex justify="space-between" align="start">
													<Box>
														<HStack gap="2" mb="1">
															<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{group.name}</Text>
															{group.description && (
																<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">{group.description}</Text>
															)}
														</HStack>
														<HStack gap="2">
															<HStack gap="1">
																<Text fontSize="12px" fontWeight="500" color="#a78bfa">{activeBackend?.name || 'Unknown'}</Text>
															</HStack>
														</HStack>
													</Box>
													<HStack gap="1">
														<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.08)' }} borderRadius="md" onClick={() => setEditingGroup(group)}>
															<Edit size={14} />
														</Button>
														<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => confirmDeleteGroup(group.id)}>
															<Trash2 size={14} />
														</Button>
													</HStack>
												</Flex>

												<Box>
													<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Members ({memberBackends.length})</Text>
													<VStack align="stretch" gap="2">
														{memberBackends.map(backend => {
															const isActive = group.activeBackendId === backend.id;
															const isClickable = !isActive && memberBackends.length > 1;
															return (
																<HStack key={backend.id} px="3" py="2" borderRadius="md" bg={isActive ? 'rgba(167, 139, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={isActive ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.06)'} cursor={isClickable ? 'pointer' : 'default'} _hover={{ borderColor: isClickable ? 'rgba(167, 139, 250, 0.5)' : undefined }} onClick={() => isClickable && setActivatingBackend({ groupId: group.id, newBackendId: backend.id })}>
																	<Flex w="6" h="6" borderRadius="md" bg={isActive ? 'rgba(167, 139, 250, 0.2)' : 'rgba(255, 255, 255, 0.04)'} alignItems="center" justifyContent="center">
																		<Terminal size={10} color={isActive ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'} />
																	</Flex>
																	<Box flex="1">
																		<HStack justify="space-between">
																			<Text fontSize="12px" color={isActive ? '#e4e4e7' : 'rgba(255, 255, 255, 0.7)'} fontWeight={isActive ? '600' : '400'}>{backend.name}</Text>
																			{isActive && (
																				<HStack gap="1">
																					<Text fontSize="10px" color="#a78bfa" fontWeight="500">ACTIVE</Text>
																				</HStack>
																			)}
																		</HStack>
																	</Box>
																</HStack>
															);
														})}
													</VStack>
												</Box>
											</VStack>
										</Box>
									);
								})}
							</Flex>
						)}
					</Box>
						</Collapsible.Content>
					</Collapsible.Root>
				</Box>
			</VStack>
			</Box>

			{showAddDialog && (
				<BackendDialog
					onClose={() => setShowAddDialog(false)}
				/>
			)}

			{editingBackend && (
				<BackendDialog
					editData={{
						id: editingBackend.id,
						name: editingBackend.name,
						path: editingBackend.path,
						description: editingBackend.description ?? '',
						defaultArgs: editingBackend.defaultArgs,
					}}
					onClose={() => setEditingBackend(null)}
				/>
			)}

			{deletingId && (
				<ConfirmDialog
					title="Delete Backend?"
					message={`This will remove the backend from your configuration. Any servers using this backend will stop.`}
					isOpen={true}
					isLoading={deleteMut.loading}
					onCancel={() => setDeletingId(null)}
					onConfirm={() => handleDelete(deletingId)}
				/>
			)}

			{deletingGroupId && (
				<ConfirmDialog
					title="Delete Backend Group?"
					message={`This will remove the group "${groups.find(g => g.id === deletingGroupId)?.name}". Servers using this group will need to be reassigned.`}
					isOpen={true}
					isLoading={deleteGroupMut.loading}
					onCancel={() => setDeletingGroupId(null)}
					onConfirm={() => handleDeleteGroup(deletingGroupId)}
				/>
			)}

			{showAddGroup && (
				<BackendGroupDialog
					backends={backends}
					servers={servers}
					onClose={() => setShowAddGroup(false)}
				/>
			)}

			{editingGroup && (
				<BackendGroupDialog
					editData={{
						id: editingGroup.id,
						name: editingGroup.name,
						description: editingGroup.description,
						backendIds: editingGroup.backendIds,
						activeBackendId: editingGroup.activeBackendId,
					}}
					backends={backends}
					servers={servers}
					onClose={() => setEditingGroup(null)}
				/>
			)}

			{activatingBackend && (
				<ActivateBackendDialog
					isOpen={!!activatingBackend}
					onClose={() => setActivatingBackend(null)}
					groupId={activatingBackend.groupId}
					group={groups.find(g => g.id === activatingBackend.groupId)!}
					newBackendId={activatingBackend.newBackendId}
					newBackend={backends.find(b => b.id === activatingBackend.newBackendId)!}
					currentBackend={backends.find(b => b.id === groups?.find(g => g.id === activatingBackend.groupId)?.activeBackendId)}
					affectedServers={servers.filter(s =>
						s.backendGroupId === activatingBackend.groupId &&
						s.status === EServerStatus.RUNNING
					)}
				/>
			)}
		</Box>
	);
}
