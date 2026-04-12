import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner, Input } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, CheckCircle, Trash2, Edit, RefreshCw, AlertCircle, Layers } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { fetchBackends, deleteBackend, validateBackend, fetchBackendGroups, createBackendGroup, deleteBackendGroup, activateBackendInGroup } from '../api/services';
import { BackendDialog } from '../components/dialogs/BackendDialog';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import type { IBackend, IBackendGroup } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';

const STATUS_COLORS: Record<string, string> = {
	[EValidationStatus.VALID]: '#34d399',
	[EValidationStatus.INVALID]: '#fb7185',
	[EValidationStatus.IDLE]: 'rgba(255, 255, 255, 0.3)',
	[EValidationStatus.CHECKING]: '#fbbf24',
};

export function BackendsPage() {
	const backendsFetcher = useCallback(() => fetchBackends(), []);
	const { data: backends, loading, refetch } = useListQuery<IBackend>(backendsFetcher, { pollInterval: 0 });

	const groupsFetcher = useCallback(() => fetchBackendGroups(), []);
	const { data: groups, loading: groupsLoading, refetch: refetchGroups } = useListQuery<IBackendGroup>(groupsFetcher, { pollInterval: 0 });

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [showAddGroup, setShowAddGroup] = useState(false);
	const [editingBackend, setEditingBackend] = useState<IBackend | null>(null);
	const [editingGroup, setEditingGroup] = useState<IBackendGroup | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
	const [validatingId, setValidatingId] = useState<string | null>(null);
	const [newGroupName, setNewGroupName] = useState('');
	const [newGroupDescription, setNewGroupDescription] = useState('');
	const [newGroupBackendIds, setNewGroupBackendIds] = useState<string[]>([]);
	const [newGroupActiveBackendId, setNewGroupActiveBackendId] = useState<string>('');

	const deleteMut = useMutation<string, null>(
		useCallback((id: string) => deleteBackend(id), [])
	);

	const deleteGroupMut = useMutation<string, null>(
		useCallback((id: string) => deleteBackendGroup(id), [])
	);

	const handleDelete = async (id: string) => {
		await deleteMut.mutate(id);
		await refetch();
		setDeletingId(null);
	};

	const confirmDelete = (id: string) => {
		setDeletingId(id);
	};

	const handleDeleteGroup = async (id: string) => {
		await deleteGroupMut.mutate(id);
		await refetchGroups();
		setDeletingGroupId(null);
	};

	const confirmDeleteGroup = (id: string) => {
		setDeletingGroupId(id);
	};

	const handleValidate = async (id: string) => {
		setValidatingId(id);
		await validateBackend(id);
		await refetch();
		setValidatingId(null);
	};

	const handleCreateGroup = async () => {
		if (!newGroupName.trim() || newGroupBackendIds.length === 0) return;
		await createBackendGroup({
			name: newGroupName.trim(),
			description: newGroupDescription.trim(),
			backendIds: newGroupBackendIds,
			activeBackendId: newGroupActiveBackendId,
		});
		setNewGroupName('');
		setNewGroupDescription('');
		setNewGroupBackendIds([]);
		setNewGroupActiveBackendId('');
		setShowAddGroup(false);
		await refetchGroups();
	};

	const handleActivateBackend = async (groupId: string, backendId: string) => {
		await activateBackendInGroup(groupId, backendId);
		await refetchGroups();
	};

	const sortedGroups = useMemo(() => {
		return [...(groups || [])].sort((a, b) => a.name.localeCompare(b.name));
	}, [groups]);

	return (
		<Box>
			<PageHeader
				title="Backends"
				subtitle="Registered llama.cpp builds"
				icon={<Blocks size={20} />}
				actions={
					<HStack gap="2">
						<Button
							size="sm"
							bg="rgba(51, 129, 255, 0.12)"
							color="#3381ff"
							borderWidth="1px"
							borderColor="rgba(51, 129, 255, 0.25)"
							_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="500"
							onClick={() => setShowAddDialog(true)}
						>
							<Plus size={15} />
							Add Backend
						</Button>
						<Button
							size="sm"
							bg="rgba(167, 139, 250, 0.12)"
							color="#a78bfa"
							borderWidth="1px"
							borderColor="rgba(167, 139, 250, 0.25)"
							_hover={{ bg: 'rgba(167, 139, 250, 0.2)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="500"
							onClick={() => setShowAddGroup(true)}
						>
							<Layers size={15} />
							Add Group
						</Button>
					</HStack>
				}
			/>
			<VStack align="stretch" gap="6">
				{/* Backends Section */}
				<Box>
					<Text fontSize="14px" fontWeight="600" color="#a78bfa" textTransform="uppercase" letterSpacing="0.05em" mb="3">Backends</Text>
					<Box p="4">
						{loading && backends.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
							</Flex>
						) : backends.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Blocks size={40} />
									<Text fontSize="14px">No backends registered</Text>
								</VStack>
							</Flex>
						) : (
							<VStack align="stretch" gap="4">
								{backends.map(backend => {
									const statusColor = STATUS_COLORS[backend.validation] ?? 'rgba(255, 255, 255, 0.3)';

									return (
										<Card key={backend.id}>
											<VStack align="stretch" gap="4">
												<Flex justify="space-between" align="start">
													<HStack gap="3">
														<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)">
															<Terminal size={20} color="rgba(255, 255, 255, 0.5)" />
														</Flex>
														<Box>
															<HStack gap="2">
																<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{backend.name}</Text>
																<HStack gap="1" color={statusColor}>
																	{backend.validation === EValidationStatus.VALID ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
																	<Text fontSize="11px" fontWeight="500">{backend.version || backend.validation}</Text>
																</HStack>
															</HStack>
															<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace' lineClamp={1}>{backend.path}</Text>
														</Box>
													</HStack>
													<HStack gap="1">
														<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setEditingBackend(backend)}>
															<Edit size={14} />
														</Button>
														<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={() => handleValidate(backend.id)} disabled={validatingId === backend.id}>
															{validatingId === backend.id ? <Spinner size="xs" /> : <RefreshCw size={14} />}
														</Button>
														<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => confirmDelete(backend.id)}>
															<Trash2 size={14} />
														</Button>
													</HStack>
												</Flex>

												{backend.defaultArgs.length > 0 && (
													<Box>
														<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Default Arguments</Text>
														<HStack gap="1.5" flexWrap="wrap">
															{backend.defaultArgs.map((arg: string, i: number) => (
																<Badge key={i} px="2" py="0.5" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(255, 255, 255, 0.04)" color="rgba(255, 255, 255, 0.6)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
																	{arg}
																</Badge>
															))}
														</HStack>
													</Box>
												)}

												{backend.detectedDevices.length > 0 && (
													<Box>
														<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Detected Devices</Text>
														<VStack align="stretch" gap="1">
															{backend.detectedDevices.map((device: { name: string; backendType: string }, i: number) => (
																<Text key={i} fontSize="12px" color="rgba(255, 255, 255, 0.5)">{device.name} ({device.backendType})</Text>
															))}
														</VStack>
													</Box>
												)}
											</VStack>
										</Card>
									);
								})}
							</VStack>
						)}
					</Box>
				</Box>

				{/* Backend Groups Section */}
				<Box>
					<Text fontSize="14px" fontWeight="600" color="#a78bfa" textTransform="uppercase" letterSpacing="0.05em" mb="3">Backend Groups</Text>
					<Box p="4">
						{groupsLoading && groups.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
							</Flex>
						) : groups.length === 0 ? (
							<Flex h="200px" alignItems="center" justifyContent="center">
								<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
									<Layers size={40} />
									<Text fontSize="14px">No backend groups</Text>
								</VStack>
							</Flex>
						) : (
							<VStack align="stretch" gap="4">
								{sortedGroups.map(group => {
									const activeBackend = backends.find(b => b.id === group.activeBackendId);
									const memberBackends = group.backendIds.map(id => backends.find(b => b.id === id)).filter((b): b is IBackend => !!b);

									return (
										<Card key={group.id}>
											<VStack align="stretch" gap="4">
												<Flex justify="space-between" align="start">
													<Box>
														<HStack gap="2" mb="1">
															<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{group.name}</Text>
															{group.description && (
																<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">{group.description}</Text>
															)}
														</HStack>
														<HStack gap="2">
															<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)">Active:</Text>
															<HStack gap="1">
																<Flex w="6" h="6" borderRadius="md" bg="#a78bfa" alignItems="center" justifyContent="center">
																	<Terminal size={10} color="white" />
																</Flex>
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
													<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Member Backends ({memberBackends.length})</Text>
													<VStack align="stretch" gap="2">
														{memberBackends.map(backend => (
															<HStack key={backend.id} px="3" py="2" borderRadius="md" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" _hover={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}>
																<Flex w="6" h="6" borderRadius="md" bg="rgba(255, 255, 255, 0.04)" alignItems="center" justifyContent="center">
																	<Terminal size={10} color="rgba(255, 255, 255, 0.4)" />
																</Flex>
																<Box flex="1">
																	<HStack justify="space-between">
																		<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)">{backend.name}</Text>
																		{group.activeBackendId === backend.id && (
																			<HStack gap="1">
																				<Text fontSize="10px" color="#a78bfa" fontWeight="500">ACTIVE</Text>
																				<Flex w="4" h="4" borderRadius="full" bg="#a78bfa" />
																			</HStack>
																		)}
																	</HStack>
																</Box>
															</HStack>
														))}
													</VStack>
												</Box>
											</VStack>
										</Card>
									);
								})}
							</VStack>
						)}
					</Box>
				</Box>
			</VStack>

			{showAddDialog && (
				<BackendDialog
					onClose={() => { setShowAddDialog(false); refetch(); }}
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
					onClose={() => { setEditingBackend(null); refetch(); }}
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
					message={`This will remove the group "${groups?.find(g => g.id === deletingGroupId)?.name}". Servers using this group will need to be reassigned.`}
					isOpen={true}
					isLoading={deleteGroupMut.loading}
					onCancel={() => setDeletingGroupId(null)}
					onConfirm={() => handleDeleteGroup(deletingGroupId)}
				/>
			)}

			{showAddGroup && (
				<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
					<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={() => setShowAddGroup(false)} />
					<Box position="relative" w="580px" maxH="90vh" bg="#0f0f12" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
						<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
							<HStack gap="3">
								<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(167, 139, 250, 0.1)" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.2)">
									<Layers size={18} color="#a78bfa" />
								</Flex>
								<Box>
									<Text fontSize="16px" fontWeight="700" color="#e4e4e7">Create Backend Group</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)">Group multiple backends for easy switching</Text>
								</Box>
							</HStack>
							<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={() => setShowAddGroup(false)} minW="8" px="0">
								<Trash2 size={16} />
							</Button>
						</Flex>

						<Box flex="1" overflowY="auto" p="6">
							<VStack align="stretch" gap="5">
								<Box>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Group Name</Text>
									<Input placeholder="e.g. ROCm Backends" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={newGroupName} onChange={e => setNewGroupName(e.target.value)} />
								</Box>

								<Box>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
									<Input placeholder="Notes about this group..." size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={newGroupDescription} onChange={e => setNewGroupDescription(e.target.value)} />
								</Box>

								<Box>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Backends</Text>
									<VStack align="stretch" gap="2" maxH="200px" overflowY="auto">
										{backends.map(backend => {
											const isSelected = newGroupBackendIds.includes(backend.id);
											return (
												<HStack key={backend.id} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'rgba(167, 139, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={isSelected ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.06)'} onClick={() => {
													if (isSelected) {
														setNewGroupBackendIds(newGroupBackendIds.filter(id => id !== backend.id));
														if (newGroupActiveBackendId === backend.id) {
															setNewGroupActiveBackendId(newGroupBackendIds.find(id => id !== backend.id) ?? '');
														}
													} else {
														setNewGroupBackendIds([...newGroupBackendIds, backend.id]);
														if (!newGroupActiveBackendId) {
															setNewGroupActiveBackendId(backend.id);
														}
													}
												}}>
													<Flex w="5" h="5" borderRadius="md" bg={isSelected ? '#a78bfa' : 'rgba(255, 255, 255, 0.1)'} alignItems="center" justifyContent="center">
														{isSelected && <CheckCircle size={10} color="white" />}
													</Flex>
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)">{backend.name}</Text>
												</HStack>
											);
										})}
									</VStack>
								</Box>

								{newGroupBackendIds.length > 0 && (
									<Box>
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Active Backend</Text>
										<VStack align="stretch" gap="2">
											{newGroupBackendIds.map(backendId => {
												const backend = backends.find(b => b.id === backendId);
												if (!backend) return null;
												const isSelected = newGroupActiveBackendId === backendId;
												return (
													<HStack key={backendId} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={isSelected ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.06)'} onClick={() => setNewGroupActiveBackendId(backendId)}>
														<Flex w="5" h="5" borderRadius="md" bg={isSelected ? '#34d399' : 'rgba(255, 255, 255, 0.1)'} alignItems="center" justifyContent="center">
															{isSelected && <CheckCircle size={10} color="white" />}
														</Flex>
														<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)">{backend.name}</Text>
													</HStack>
												);
											})}
										</VStack>
									</Box>
								)}
							</VStack>
						</Box>

						<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
							<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={() => setShowAddGroup(false)}>Cancel</Button>
							<Button size="sm" disabled={!newGroupName.trim() || newGroupBackendIds.length === 0} bg="rgba(167, 139, 250, 0.15)" color="#a78bfa" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.3)" _hover={{ bg: 'rgba(167, 139, 250, 0.25)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleCreateGroup}>
								<Layers size={14} />
								Create Group
							</Button>
						</Flex>
					</Box>
				</Box>
			)}
		</Box>
	);
}
