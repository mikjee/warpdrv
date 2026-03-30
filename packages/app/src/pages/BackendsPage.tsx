import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner } from '@chakra-ui/react';
import { Blocks, Plus, Terminal, CheckCircle, Trash2, Edit, RefreshCw, AlertCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { fetchBackends, deleteBackend, validateBackend } from '../api/services';
import { BackendDialog } from '../components/dialogs/BackendDialog';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import type { IBackend } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';

const STATUS_COLORS: Record<string, string> = {
	[EValidationStatus.VALID]: '#34d399',
	[EValidationStatus.INVALID]: '#fb7185',
	[EValidationStatus.IDLE]: 'rgba(255, 255, 255, 0.3)',
	[EValidationStatus.CHECKING]: '#fbbf24',
};

export function BackendsPage() {
	const fetcher = useCallback(() => fetchBackends(), []);
	const { data: backends, loading, refetch } = useListQuery<IBackend>(fetcher, { pollInterval: 0 });

	const [showAddDialog, setShowAddDialog] = useState(false);
	const [editingBackend, setEditingBackend] = useState<IBackend | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [validatingId, setValidatingId] = useState<string | null>(null);

	const deleteMut = useMutation<string, null>(
		useCallback((id: string) => deleteBackend(id), [])
	);

	const handleDelete = async (id: string) => {
		await deleteMut.mutate(id);
		await refetch();
		setDeletingId(null);
	};

	const confirmDelete = (id: string) => {
		setDeletingId(id);
	};

	const handleValidate = async (id: string) => {
		setValidatingId(id);
		await validateBackend(id);
		await refetch();
		setValidatingId(null);
	};

	return (
		<Box>
			<PageHeader
				title="Backends"
				subtitle="Registered llama.cpp builds"
				icon={<Blocks size={20} />}
				actions={
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
				}
			/>
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
					message={`This will remove the backend from your configuration. Any servers using this backend will stop.}`}
					isOpen={true}
					isLoading={deleteMut.loading}
					onCancel={() => setDeletingId(null)}
					onConfirm={() => handleDelete(deletingId)}
				/>
			)}
		</Box>
	);
}
