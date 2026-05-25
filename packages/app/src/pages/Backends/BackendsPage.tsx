import { Box, Text, HStack, VStack, Flex, Badge, Button, Input, Collapsible, InputGroup, Combobox, createListCollection, Portal, Link as ChakraLink } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, Layers, ChevronDown, ChevronRight, Search, ArrowUpAZ, ArrowDownZA, CheckCircle, AlertCircle, Edit, Trash2, Mic } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { deleteBackend, validateBackend, createBackendGroup, deleteBackendGroup, activateBackendInGroup, restartServer, updateBackendGroup, updateSettings } from '../../api/services';
import { BackendDialog } from './BackendDialog';
import { BackendGroupDialog } from './BackendGroupDialog';
import { WhisperBackendDialog } from './WhisperBackendDialog';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { ActivateBackendDialog } from './ActivateBackendDialog';
import { BackendRow } from './BackendRow';
import { BackendGroupCard } from './BackendGroupCard';
import { openExternal } from '../../utils/openExternal';
import type { IBackend, IBackendGroup, IServer, TBackendSortField, IWhisperBackend, TWhisperBackendId } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';
import { removeWhisperBackend, createWhisperBackend } from '../../api/whisperServices';
import { EServerStatus } from '@warpcore/shared';

const FIELD_LABELS: Record<TBackendSortField, string> = {
	name: 'Name',
	createdAt: 'Creation date',
	updatedAt: 'Update date',
};

export function BackendsPage() {
	const backends = useStore((s) => s.backends);
	const groups = useStore((s) => s.backendGroups);
	const whisperBackends = useStore((s) => s.whisperBackends);

	const backendsArr = useMemo(() => Object.values(backends), [backends]);
	const groupsArr = useMemo(() => Object.values(groups), [groups]);
	const whisperBackendsArr = useMemo(() => Object.values(whisperBackends), [whisperBackends]);

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showAddWhisperDialog, setShowAddWhisperDialog] = useState(false);
	const [editingWhisperBackend, setEditingWhisperBackend] = useState<IWhisperBackend | null>(null);
	const [deletingWhisperId, setDeletingWhisperId] = useState<string | null>(null);
	const [whisperExpanded, setWhisperExpanded] = useState(true);
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

	const deleteWhisperMut = useMutation<string, null>(
		useCallback((id: string) => removeWhisperBackend(id), [])
	);

	const handleDeleteWhisper = async (id: string) => {
		await deleteWhisperMut.mutate(id);
		setDeletingWhisperId(null);
	};

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
						<InputGroup startElement={<Search size={14} color="var(--wc-text-muted)" />} w="220px">
							<Input
								placeholder="Search backends and groups"
								size="sm"
								bg="var(--wc-bg-card)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'var(--wc-text-faint)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
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
													bg="var(--wc-bg-subtle)"
													borderColor="var(--wc-border-default)"
													color="var(--wc-text-secondary)"
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
													bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'var(--wc-bg-hover)' }}
															_highlighted={{ bg: 'var(--wc-accent-blue-bg-10)' }}
														>
															<Text fontSize="12px" color="var(--wc-text-primary)">{item.label}</Text>
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
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-tertiary)"
								p="3" minW="auto"
								borderRadius="md"
								_hover={{ borderColor: 'var(--wc-border-strong)' }}
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
				<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-surface)" overflow="hidden">
					<Flex mb="4" px="4" py="3" align="center" justify="space-between" cursor="pointer" onClick={() => setBackendsExpanded(!backendsExpanded)} _hover={{ bg: 'var(--wc-bg-surface)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="var(--wc-text-muted)">{backendsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Terminal size={16} color="var(--wc-text-tertiary)" />
							<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">Backends</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="var(--wc-bg-hover)" color="var(--wc-text-muted)" fontSize="10px" fontWeight="600">{filteredAndSortedBackends.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ bg: 'var(--wc-accent-blue-bg-15)', color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.stopPropagation(); setShowAddDialog(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={backendsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
							{filteredAndSortedBackends.length === 0 && backendsArr.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--wc-text-faint)">
									<Blocks size={40} />
									<Text fontSize="14px">No backends registered</Text>
								<Text fontSize="12px" color="var(--wc-text-faint)" textAlign="center">
									Download a llama.cpp build from{' '}
									<ChakraLink href="https://github.com/ggml-org/llama.cpp/releases" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/ggml-org/llama.cpp/releases'); }}>
										Official releases
									</ChakraLink>.
									<br />
									Or build llama.cpp from source following the{' '}
									<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md'); }}>
										guide for Recipes
									</ChakraLink>.
								</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedBackends.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--wc-text-faint)">
									<Blocks size={40} />
									<Text fontSize="14px">No matching backends</Text>
									<Text fontSize="12px" color="var(--wc-text-disabled)">Try adjusting your search query</Text>
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
				<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-surface)" overflow="hidden">
					<Flex px="4" py="3" mb="4" align="center" justify="space-between" cursor="pointer" onClick={() => setGroupsExpanded(!groupsExpanded)} _hover={{ bg: 'var(--wc-bg-surface)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="var(--wc-text-muted)">{groupsExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Layers size={16} color="var(--wc-text-tertiary)" />
							<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">Groups</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="var(--wc-bg-hover)" color="var(--wc-text-muted)" fontSize="10px" fontWeight="600">{filteredAndSortedGroups.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ bg: 'var(--wc-accent-purple-bg-15)', color: 'var(--wc-accent-purple)' }} onClick={(e) => { e.stopPropagation(); setShowAddGroup(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={groupsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
						{filteredAndSortedGroups.length === 0 && groupsArr.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--wc-text-faint)">
									<Layers size={40} />
									<Text fontSize="14px">No backend groups</Text>
								<Text fontSize="12px" color="var(--wc-text-faint)" textAlign="center">
									Read the{' '}
									<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/backend-groups.md" color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/backend-groups.md'); }}>
										guide
									</ChakraLink>{' '}
									on how to use backend groups.
								</Text>
								</VStack>
							</Flex>
						) : filteredAndSortedGroups.length === 0 && searchQuery.trim() ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="var(--wc-text-faint)">
									<Layers size={40} />
									<Text fontSize="14px">No matching groups</Text>
									<Text fontSize="12px" color="var(--wc-text-disabled)">Try adjusting your search query</Text>
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

				{/* Whisper Backends Section */}
				<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-surface)" overflow="hidden">
					<Flex px="4" py="3" mb="4" align="center" justify="space-between" cursor="pointer" onClick={() => setWhisperExpanded(!whisperExpanded)} _hover={{ bg: 'var(--wc-bg-surface)' }} transition="background 0.15s ease">
						<HStack gap="3">
							<Box color="var(--wc-text-muted)">{whisperExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Blocks size={16} color="var(--wc-text-tertiary)" />
							<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">Whisper.cpp Backends</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="var(--wc-bg-hover)" color="var(--wc-text-muted)" fontSize="10px" fontWeight="600">{whisperBackendsArr.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ bg: 'var(--wc-accent-green-bg-15)', color: 'var(--wc-accent-green)' }} onClick={(e) => { e.stopPropagation(); setShowAddWhisperDialog(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={whisperExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
								{whisperBackendsArr.length === 0 ? (
									<Flex h="150px" alignItems="center" justifyContent="center">
										<VStack gap="3" color="var(--wc-text-faint)">
											<Blocks size={40} />
											<Text fontSize="14px">No whisper backends registered</Text>
											<Text fontSize="12px" color="var(--wc-text-faint)" textAlign="center">
												Build whisper.cpp from source and register the whisper-server binary here.
											</Text>
										</VStack>
									</Flex>
								) : (
									<VStack align="stretch" gap="3">
										{whisperBackendsArr.map(backend => (
											<Box key={backend.id} px="3" py="2" borderRadius="lg" bg="var(--wc-bg-card)" borderWidth="1px" borderColor="var(--wc-border-subtle)">
												<Flex justify="space-between" align="center">
													<HStack gap="3" flex="1" minW="0">
														<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--wc-bg-surface)">
															<Mic size={20} color="var(--wc-text-tertiary)" />
														</Flex>
														<Box flex="1" minW="0">
															<HStack gap="2">
																<Text fontSize="13px" fontWeight="500" color="var(--wc-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{backend.name}</Text>
																{backend.validation === EValidationStatus.VALID && <CheckCircle size={14} color="var(--wc-accent-green)" />}
																{backend.validation === EValidationStatus.INVALID && <AlertCircle size={14} color="var(--wc-accent-red)" />}
															</HStack>
															<Text fontSize="11px" color="var(--wc-text-muted)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{backend.path}</Text>
														</Box>
													</HStack>
													<HStack gap="1">
														<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="md" onClick={() => setEditingWhisperBackend(backend)}>
															<Edit size={14} />
														</Button>
														<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={() => setDeletingWhisperId(backend.id)}>
															<Trash2 size={14} />
														</Button>
													</HStack>
												</Flex>
											</Box>
										))}
									</VStack>
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

			{showAddWhisperDialog && (
				<WhisperBackendDialog
					onClose={() => setShowAddWhisperDialog(false)}
				/>
			)}

			{editingWhisperBackend && (
				<WhisperBackendDialog
					editBackendId={editingWhisperBackend.id}
					onClose={() => setEditingWhisperBackend(null)}
				/>
			)}

			{deletingWhisperId && (
				<ConfirmDialog
					title="Delete Whisper Backend?"
					message="This will remove the whisper backend from your configuration."
					isOpen={true}
					isLoading={deleteWhisperMut.loading}
					onCancel={() => setDeletingWhisperId(null)}
					onConfirm={() => handleDeleteWhisper(deletingWhisperId)}
				/>
			)}
		</Box>
	);
}
