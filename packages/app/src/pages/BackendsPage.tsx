import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner, Input, Collapsible } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, CheckCircle, Trash2, Edit, RefreshCw, AlertCircle, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { useStore } from '../store';
import { fetchBackends, deleteBackend, validateBackend, fetchBackendGroups, createBackendGroup, deleteBackendGroup, activateBackendInGroup, restartServer, updateBackendGroup } from '../api/services';
import { BackendDialog } from '../components/dialogs/BackendDialog';
import { BackendGroupDialog } from '../components/dialogs/BackendGroupDialog';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { ActivateBackendDialog } from '../components/dialogs/ActivateBackendDialog';
import type { IBackend, IBackendGroup, IServer } from '@warpcore/shared';
import { EValidationStatus, EServerStatus } from '@warpcore/shared';

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
	const [backendsExpanded, setBackendsExpanded] = useState(true);
	const [groupsExpanded, setGroupsExpanded] = useState(true);
	const [activatingBackend, setActivatingBackend] = useState<{ groupId: string; newBackendId: string } | null>(null);

	const serversRecord = useStore((s) => s.servers);
	const servers = useMemo(() => Object.values(serversRecord), [serversRecord]);

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
							<Badge size="sm" px="1.5" borderRadius="full" bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.4)" fontSize="10px" fontWeight="600">{backends.length}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="rgba(255,255,255,0.5)" _hover={{ bg: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }} onClick={(e) => { e.stopPropagation(); setShowAddDialog(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={backendsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
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
										<Box key={backend.id} px="3" py="2" borderRadius="lg" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
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
										</Box>
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
							<Text fontSize="13px" fontWeight="600" color="rgba(255,255,255,0.8)">Backend Groups</Text>
							<Badge size="sm" px="1.5" borderRadius="full" bg="rgba(255,255,255,0.06)" color="rgba(255,255,255,0.4)" fontSize="10px" fontWeight="600">{groups?.length ?? 0}</Badge>
						</HStack>
						<Button size="xs" variant="ghost" color="rgba(255,255,255,0.5)" _hover={{ bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' }} onClick={(e) => { e.stopPropagation(); setShowAddGroup(true); }}>
							<Plus size={15} />
						</Button>
					</Flex>
					<Collapsible.Root open={groupsExpanded}>
						<Collapsible.Content>
							<Box px="4" pb="3">
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
							<Flex gap="2" flexWrap="wrap">
								{sortedGroups.map(group => {
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
																					<Flex w="2" h="2" borderRadius="full" bg="#a78bfa" shadow="0 0 6px #a78bfa" />
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
				<BackendGroupDialog
					backends={backends}
					servers={servers}
					onClose={() => setShowAddGroup(false)}
					onGroupUpdated={refetchGroups}
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
					onGroupUpdated={refetchGroups}
				/>
			)}

			{activatingBackend && (
				<ActivateBackendDialog
					isOpen={!!activatingBackend}
					onClose={() => setActivatingBackend(null)}
					groupId={activatingBackend.groupId}
					group={groups?.find(g => g.id === activatingBackend.groupId)!}
					newBackendId={activatingBackend.newBackendId}
					newBackend={backends.find(b => b.id === activatingBackend.newBackendId)!}
					currentBackend={backends.find(b => b.id === groups?.find(g => g.id === activatingBackend.groupId)?.activeBackendId)!}
					affectedServers={servers.filter(s =>
						s.backendGroupId === activatingBackend.groupId &&
						s.status === EServerStatus.RUNNING
					)}
				/>
			)}
		</Box>
	);
}
