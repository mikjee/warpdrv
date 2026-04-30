import { Box, Text, HStack, VStack, Flex, Badge, Button, Input, Collapsible, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
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
						<InputGroup startElement={<Search size={14} color="rgba(255, 255, 255, 0.3)" />} w="220px">
							<Input
								placeholder="Search backends and groups"
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
								p="3" minW="auto"
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

			<Box pt="76px" px="4" pb="4">
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
							{filteredAndSortedBackends.length === 0 && backendsArr.length === 0 ? (
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
						{filteredAndSortedGroups.length === 0 && groupsArr.length === 0 ? (
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
