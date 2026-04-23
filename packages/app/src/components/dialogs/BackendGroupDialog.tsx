import { useState, useMemo, useCallback } from 'react';
import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Portal } from '@chakra-ui/react';
import { Layers, CheckCircle, X } from 'lucide-react';
import { createBackendGroup, updateBackendGroup, restartServer } from '../../api/services';
import { ActivateBackendDialog } from './ActivateBackendDialog';
import type { IBackend, IBackendGroup, IBackendGroupCreatePayload, IBackendGroupUpdatePayload, IServer } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '../ToastProvider';

interface IBackendGroupDialogProps {
	onClose: () => void;
	editData?: {
		id: string;
		name: string;
		description: string | undefined;
		backendIds: string[];
		activeBackendId: string;
	};
	backends: IBackend[];
	servers: IServer[];
}

interface IPendingSave {
	name: string;
	description: string;
	backendIds: string[];
	activeBackendId: string;
}

export function BackendGroupDialog({ onClose, editData, backends, servers }: IBackendGroupDialogProps) {
	const { toast } = useToast();
	const isEdit = !!editData;

	const [name, setName] = useState(editData?.name ?? '');
	const [description, setDescription] = useState(editData?.description ?? '');
	const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>(editData?.backendIds ?? []);
	const [activeBackendId, setActiveBackendId] = useState<string>(editData?.activeBackendId ?? '');
	const [saving, setSaving] = useState(false);

	const [showActivateDialog, setShowActivateDialog] = useState(false);
	const [pendingSave, setPendingSave] = useState<IPendingSave | null>(null);
	const [capturedAffectedServers, setCapturedAffectedServers] = useState<IServer[]>([]);
	const originalActiveBackendId = editData?.activeBackendId ?? null;

	const hasActiveChange = isEdit && activeBackendId !== originalActiveBackendId;

	const affectedServers = useMemo(() => {
		if (!isEdit || !hasActiveChange || !editData) return [];
		return servers.filter(s => s.backendGroupId === editData.id && s.status === EServerStatus.RUNNING);
	}, [isEdit, hasActiveChange, editData, servers]);

	const handleShowActivateDialog = useCallback(() => {
		const currentAffected = servers.filter(s => s.backendGroupId === editData!.id && s.status === EServerStatus.RUNNING);
		setCapturedAffectedServers(currentAffected);
		setShowActivateDialog(true);
	}, [editData, servers]);

	const handleToggleBackend = (backendId: string) => {
		const isSelected = selectedBackendIds.includes(backendId);
		if (isSelected) {
			const newIds = selectedBackendIds.filter(id => id !== backendId);
			setSelectedBackendIds(newIds);
			if (activeBackendId === backendId && newIds.length > 0) {
				setActiveBackendId(newIds[0]!);
			}
		} else {
			const newIds = [...selectedBackendIds, backendId];
			setSelectedBackendIds(newIds);
			if (!activeBackendId) {
				setActiveBackendId(backendId);
			}
		}
	};

	const handleSave = async () => {
		if (!name.trim() || selectedBackendIds.length === 0) return;

		const saveData: IPendingSave = {
			name: name.trim(),
			description: description.trim(),
			backendIds: selectedBackendIds,
			activeBackendId: activeBackendId,
		};

		if (hasActiveChange && editData && affectedServers.length > 0) {
			setPendingSave(saveData);
			handleShowActivateDialog();
			return;
		}

		await completeSave(saveData);
	};

	const completeSave = async (saveData: IPendingSave) => {
		setSaving(true);
		const updatePayload: IBackendGroupUpdatePayload = { name: saveData.name, description: saveData.description, backendIds: saveData.backendIds, activeBackendId: saveData.activeBackendId };
		const createPayload: IBackendGroupCreatePayload = { name: saveData.name, description: saveData.description, backendIds: saveData.backendIds, activeBackendId: saveData.activeBackendId };

		const result = isEdit
			? await updateBackendGroup(editData!.id, updatePayload)
			: await createBackendGroup(createPayload);

		setSaving(false);
		if (result.ok) {
			toast('success', isEdit ? `Group "${saveData.name}" updated` : `Group "${saveData.name}" created`);
			onClose();
		} else {
			toast('error', result.error ?? (isEdit ? 'Failed to update group' : 'Failed to create group'));
		}
	};

	const handleCompleteSave = async () => {
		if (!pendingSave || !editData) return;
		await completeSave(pendingSave);
	};

	const handleCompleteSaveWithRestart = async () => {
		if (!pendingSave || !editData) return;

		setSaving(true);
		const payload: IBackendGroupUpdatePayload = {
			name: pendingSave.name,
			description: pendingSave.description,
			backendIds: pendingSave.backendIds,
			activeBackendId: pendingSave.activeBackendId,
		};

		const result = await updateBackendGroup(editData.id, payload);
		setSaving(false);

		if (result.ok) {
			toast('success', `Group "${pendingSave.name}" updated`);

			const restartPromises = capturedAffectedServers.map(async (server) => {
				try {
					await restartServer(server.id);
				} catch (error) {
					toast('error', `Failed to restart server ${server.serverName}`);
				}
			});

			await Promise.all(restartPromises);
			onClose();
		} else {
			toast('error', result.error ?? 'Failed to update group');
		}
	};

	const canSave = name.trim() && selectedBackendIds.length > 0 && !saving && !showActivateDialog;

	return (
		<>
			<Box position="fixed" inset="6px" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius="12px" overflow="hidden">
				<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={() => !saving && !showActivateDialog && onClose()} />
				<Box position="relative" w="580px" maxH="90vh" bg="#0f0f12" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
					<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
						<HStack gap="3">
							<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(167, 139, 250, 0.1)" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.2)">
								<Layers size={18} color="#a78bfa" />
							</Flex>
							<Box>
								<Text fontSize="16px" fontWeight="700" color="#e4e4e7">{isEdit ? 'Edit Backend Group' : 'Create Backend Group'}</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)">{isEdit ? 'Modify group settings and members' : 'Group multiple backends for easy switching'}</Text>
							</Box>
						</HStack>
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={() => !saving && !showActivateDialog && onClose()} minW="8" px="0" disabled={saving || showActivateDialog}>
							<X size={16} />
						</Button>
					</Flex>

					<Box flex="1" overflowY="auto" p="6">
						<VStack align="stretch" gap="5">
							<Box>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Group Name</Text>
								<Input placeholder="e.g. ROCm Backends" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={name} onChange={e => setName(e.target.value)} disabled={saving || showActivateDialog} />
							</Box>

							<Box>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
								<Input placeholder="Notes about this group..." size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={description} onChange={e => setDescription(e.target.value)} disabled={saving || showActivateDialog} />
							</Box>

							<Box>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Backends</Text>
								<VStack align="stretch" gap="2" maxH="200px" overflowY="auto">
									{backends.map(backend => {
										const isSelected = selectedBackendIds.includes(backend.id);
										const isCurrentActive = originalActiveBackendId === backend.id;
										return (
											<HStack key={backend.id} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'rgba(167, 139, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={isSelected ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.06)'} onClick={() => !saving && !showActivateDialog && handleToggleBackend(backend.id)}>
												<Flex w="5" h="5" borderRadius="md" bg={isSelected ? '#a78bfa' : 'rgba(255, 255, 255, 0.1)'} alignItems="center" justifyContent="center">
													{isSelected && <CheckCircle size={10} color="white" />}
												</Flex>
												<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)" flex="1">{backend.name}</Text>
												{isCurrentActive && (
													<Text fontSize="10px" color="#a78bfa" fontWeight="500">CURRENT ACTIVE</Text>
												)}
											</HStack>
										);
									})}
								</VStack>
							</Box>

							{selectedBackendIds.length > 0 && (
								<Box>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Active Backend</Text>
									<VStack align="stretch" gap="2">
										{selectedBackendIds.map(backendId => {
											const backend = backends.find(b => b.id === backendId);
											if (!backend) return null;
											const isSelected = activeBackendId === backendId;
											const isCurrentActive = originalActiveBackendId === backendId;
											return (
												<HStack key={backendId} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={isSelected ? 'rgba(52, 211, 153, 0.25)' : 'rgba(255, 255, 255, 0.06)'} onClick={() => !saving && !showActivateDialog && setActiveBackendId(backendId)}>
													<Flex w="5" h="5" borderRadius="md" bg={isSelected ? '#34d399' : 'rgba(255, 255, 255, 0.1)'} alignItems="center" justifyContent="center">
														{isSelected && <CheckCircle size={10} color="white" />}
													</Flex>
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)" flex="1">{backend.name}</Text>
													{isCurrentActive && !isSelected && (
														<Text fontSize="10px" color="#a78bfa" fontWeight="500">CURRENT</Text>
													)}
													{isSelected && hasActiveChange && (
														<Text fontSize="10px" color="#34d399" fontWeight="500">NEW ACTIVE</Text>
													)}
												</HStack>
											);
										})}
									</VStack>
								</Box>
							)}
						</VStack>
					</Box>

					<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={() => !saving && !showActivateDialog && onClose()} disabled={saving || showActivateDialog}>Cancel</Button>
						<Button size="sm" disabled={!canSave} bg="rgba(167, 139, 250, 0.15)" color="#a78bfa" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.3)" _hover={{ bg: 'rgba(167, 139, 250, 0.25)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleSave}>
							{saving ? <Spinner size="xs" /> : <Layers size={14} />}
							{isEdit ? 'Save Changes' : 'Create Group'}
						</Button>
					</Flex>
				</Box>
			</Box>

			{showActivateDialog && pendingSave && editData && (
				<Portal>
					<ActivateBackendDialog
						isOpen={true}
						onClose={() => setShowActivateDialog(false)}
						groupId={editData.id}
						group={{
							id: editData.id,
							name: name,
							description: description,
							backendIds: selectedBackendIds,
							activeBackendId: originalActiveBackendId!,
							createdAt: 0,
							updatedAt: 0,
						}}
						newBackendId={activeBackendId}
						newBackend={backends.find(b => b.id === activeBackendId)!}
						currentBackend={backends.find(b => b.id === originalActiveBackendId)}
						affectedServers={capturedAffectedServers}
						onSwitchOnly={handleCompleteSave}
						onSwitchAndRestart={handleCompleteSaveWithRestart}
					/>
				</Portal>
			)}
		</>
	);
}
