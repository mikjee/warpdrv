import { Box, Text, HStack, VStack, Flex, Badge, Button, Input, Collapsible, InputGroup, Combobox, createListCollection, Portal, Link as ChakraLink } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, Layers, ChevronDown, ChevronRight, Search, ArrowUpAZ, ArrowDownZA } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { deleteBackend, validateBackend, createBackendGroup, deleteBackendGroup, activateBackendInGroup, restartServer, updateBackendGroup, updateSettings } from '../../api/services';
import { BackendDialog } from './BackendDialog';
import { BackendGroupDialog } from './BackendGroupDialog';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { ActivateBackendDialog } from './ActivateBackendDialog';
import { BackendRow } from './BackendRow';
import { BackendGroupCard } from './BackendGroupCard';
import { openExternal } from '../../utils/openExternal';
import type { IBackend, IBackendGroup, IServer, TBackendSortField } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

const FIELD_LABELS: Record<TBackendSortField, string> = {
	name: 'Name',
	createdAt: 'Creation date',
	updatedAt: 'Update date',
};

export function BackendsPage() {
	const backends = useStore((s) => s.backends);
	const groups = useStore((s) => s.backendGroups);

	const backendsArr = useMemo(() => Object.values(backends), [backends]);
	const groupsArr = useMemo(() => Object.values(groups), [groups]);

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showAddGroup, setShowAddGroup] = useState(false);
	const [editingBackend, setEditingBackend] = useState<IBackend | null>(null);
	const [editingGroup, setEditingGroup] = useState<IBackendGroup | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
	const [backendsExpanded, setBackendsExpanded] = useState(true);
	const [groupsExpanded, setGroupsExpanded] = useState(true);
	const [activatingBackend, setActivatingBackend] = useState<{ groupId: string; newBackendId: string } | null>(null);

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

	const handleDeleteGroup = async (id: string) => {
		await deleteGroupMut.mutate(id);
		setDeletingGroupId(null);
	};

	// Row/card callbacks
	const handleEditBackend = (backendId: string) => {
		const backend = backends[backendId];
		if (backend) setEditingBackend(backend);
	};

	const handleDeleteBackend = (backendId: string) => {
		setDeletingId(backendId);
	};

	const handleEditGroup = (groupId: string) => {
		const group = groups[groupId];
		if (group) setEditingGroup(group);
	};

	const handleDeleteGroupCallback = (groupId: string) => {
		setDeletingGroupId(groupId);
	};

	const handleActivateBackendCallback = (groupId: string, backendId: string) => {
		setActivatingBackend({ groupId, newBackendId: backendId });
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
		const memberBackends = group.backendIds.map(id => backends[id]).filter((b): b is IBackend => !!b);
		const searchableParts = [
			group.name,
			group.description ?? '',
			...memberBackends.map(b => b.name),
		];
		return searchableParts.some(part => part?.toLowerCase().includes(q));
	}

	const filteredAndSortedBackends = useMemo(() => {
		let result = [...backendsArr];
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
	}, [backendsArr, searchQuery, sortField, sortOrder]);

	const filteredAndSortedGroups = useMemo(() => {
		let result = [...groupsArr];
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
	}, [groupsArr, searchQuery, sortField, sortOrder]);

	return (
		<Box>
			<PageHeader
				title="Llamas"
				subtitle={` ${backendsArr.length} Builds, ${groupsArr.length} Groups`}
				icon={<Blocks size={20} />}
				actions={
					<HStack gap="3">
						<InputGroup startElement={<Search size={14} color="var(--w-header-search-icon)" />} w="220px">
							<Input
								placeholder="Search backends and groups"
								size="sm"
								bg="var(--w-header-search-bg)"
								borderColor="var(--w-header-search-border)"
								color="var(--w-header-search-color)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'var(--w-header-search-placeholder)' }}
								_focus={{ borderColor: 'var(--w-header-search-focus-border)', outline: 'none' }}
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
							/>
						</InputGroup>
						<HStack gap="3">
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
													size="sm"
													w="170px"
													justifyContent="space-between"
													bg="var(--w-header-filter-btn-bg)"
													borderColor="var(--w-header-filter-btn-border)"
													color="var(--w-header-filter-btn-color)"
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
													bg="var(--w-header-combobox-bg)" borderWidth="1px" borderColor="var(--w-header-combobox-border)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'var(--w-header-combobox-item-hover)' }}
															_highlighted={{ bg: 'var(--w-header-combobox-bg)' }}
														>
															<Text fontSize="12px" color="var(--w-header-combobox-item-text)">{item.label}</Text>
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
								bg="var(--w-header-sortorder-btn-bg)"
								borderColor="var(--w-header-sortorder-btn-border)"
								color="var(--w-header-sortorder-btn-color)"
								p="3" minW="auto"
								borderRadius="md"
								_hover={{ borderColor: 'var(--w-header-sortorder-btn-hover-border)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
					</HStack>
				}
			/>

			<Box pt="76px" px="4" pb="4">
				<VStack align="stretch" gap="4">
				{/* Backends Section */}
				<Box borderWidth="1px" borderColor="var(--w-backends-section-border)" borderRadius="xl" bg="var(--w-backends-section-bg)" overflow="hidden">
					<Flex mb="4" px="4" py="3" align="center" justify="space-between" cursor="pointer" onClick={() => setBackendsExpanded(!backendsExpanded)} _hover={{ bg: 'var(--w-backends-section-header-hover)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="var(--w-backends-section-chevron)">{backendsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Terminal size={16} color="var(--w-backends-section-icon)" />
							<Text fontSize="13px" fontWeight="600" color="var(--w-backends-section-title)">Backends</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="var(--w-backends-section-badge-bg)" color="var(--w-backends-section-badge-color)" fontSize="10px" fontWeight="600">{filteredAndSortedBackends.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--w-backends-add-btn-color)" _hover={{ bg: 'var(--w-backends-add-btn-backends-hover-bg)', color: 'var(--w-backends-add-btn-backends-hover-color)' }} onClick={(e) => { e.stopPropagation(); setShowAddDialog(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={backendsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
							{filteredAndSortedBackends.length === 0 && backendsArr.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--w-backends-empty-icon)">
									<Blocks size={40} />
									<Text fontSize="14px">No backends registered</Text>
								<Text fontSize="12px" color="var(--w-backends-empty-subtitle)" textAlign="center">
									Download a llama.cpp build from{' '}
									<ChakraLink href="https://github.com/ggml-org/llama.cpp/releases" color="var(--w-backends-empty-link)" _hover={{ color: 'var(--w-backends-empty-link-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/ggml-org/llama.cpp/releases'); }}>
										Official releases
									</ChakraLink>.
									<br />
									Or build llama.cpp from source following the{' '}
									<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" color="var(--w-backends-empty-link)" _hover={{ color: 'var(--w-backends-empty-link-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md'); }}>
										guide for Recipes
									</ChakraLink>.
								</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedBackends.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--w-backends-empty-icon)">
									<Blocks size={40} />
									<Text fontSize="14px">No matching backends</Text>
									<Text fontSize="12px" color="var(--w-backends-empty-search-hint)">Try adjusting your search query</Text>
								</VStack>
							</Flex>
						) : (
							<VStack align="stretch" gap="3">
								{filteredAndSortedBackends.map(backend => (
									<BackendRow
										key={backend.id}
										backendId={backend.id}
										onEdit={handleEditBackend}
										onDelete={handleDeleteBackend}
									/>
								))}
							</VStack>
						)}
					</Box>
						</Collapsible.Content>
					</Collapsible.Root>
				</Box>

				{/* Backend Groups Section */}
				<Box borderWidth="1px" borderColor="var(--w-backends-section-border)" borderRadius="xl" bg="var(--w-backends-section-bg)" overflow="hidden">
					<Flex px="4" py="3" mb="4" align="center" justify="space-between" cursor="pointer" onClick={() => setGroupsExpanded(!groupsExpanded)} _hover={{ bg: 'var(--w-backends-section-header-hover)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="var(--w-backends-section-chevron)">{groupsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Layers size={16} color="var(--w-backends-section-icon)" />
							<Text fontSize="13px" fontWeight="600" color="var(--w-backends-section-title)">Groups</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="var(--w-backends-section-badge-bg)" color="var(--w-backends-section-badge-color)" fontSize="10px" fontWeight="600">{filteredAndSortedGroups.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--w-backends-add-btn-color)" _hover={{ bg: 'var(--w-backends-add-btn-groups-hover-bg)', color: 'var(--w-backends-add-btn-groups-hover-color)' }} onClick={(e) => { e.stopPropagation(); setShowAddGroup(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={groupsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
						{filteredAndSortedGroups.length === 0 && groupsArr.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--w-backends-empty-icon)">
									<Layers size={40} />
									<Text fontSize="14px">No backend groups</Text>
								<Text fontSize="12px" color="var(--w-backends-empty-subtitle)" textAlign="center">
									Read the{' '}
									<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/backend-groups.md" color="var(--w-backends-empty-link)" _hover={{ color: 'var(--w-backends-empty-link-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/backend-groups.md'); }}>
										guide
									</ChakraLink>{' '}
									on how to use backend groups.
								</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedGroups.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--w-backends-empty-icon)">
									<Layers size={40} />
									<Text fontSize="14px">No matching groups</Text>
									<Text fontSize="12px" color="var(--w-backends-empty-search-hint)">Try adjusting your search query</Text>
								</VStack>
							</Flex>
						) : (
							<Flex gap="2" flexWrap="wrap">
								{filteredAndSortedGroups.map(group => (
									<BackendGroupCard
										key={group.id}
										groupId={group.id}
										onEdit={handleEditGroup}
										onDelete={handleDeleteGroupCallback}
										onActivateBackend={handleActivateBackendCallback}
									/>
								))}
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
					editBackendId={editingBackend.id}
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
					message={`This will remove the group "${groups[deletingGroupId]?.name}". Servers using this group will need to be reassigned.`}
					isOpen={true}
					isLoading={deleteGroupMut.loading}
					onCancel={() => setDeletingGroupId(null)}
					onConfirm={() => handleDeleteGroup(deletingGroupId)}
				/>
			)}

			{showAddGroup && (
				<BackendGroupDialog
					onClose={() => setShowAddGroup(false)}
				/>
			)}

			{editingGroup && (
				<BackendGroupDialog
					editGroupId={editingGroup.id}
					onClose={() => setEditingGroup(null)}
				/>
			)}

			{activatingBackend && (
				<ActivateBackendDialog
					isOpen={!!activatingBackend}
					onClose={() => setActivatingBackend(null)}
					groupId={activatingBackend.groupId}
					newBackendId={activatingBackend.newBackendId}
				/>
			)}
		</Box>
	);
}
