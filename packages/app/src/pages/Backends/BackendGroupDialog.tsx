import { useState, useMemo, useCallback } from 'react';
import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Portal } from '@chakra-ui/react';
import { Layers, CheckCircle, X } from 'lucide-react';
import { createBackendGroup, updateBackendGroup } from '../../api/services';
import { ActivateBackendDialog } from './ActivateBackendDialog';
import { useStore } from '../../store';
import type { IBackend, IBackendGroup, IBackendGroupCreatePayload, IBackendGroupUpdatePayload, TBackendGroupId } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';

interface IBackendGroupDialogProps {
	onClose: () => void;
	editGroupId?: TBackendGroupId;
}

interface IPendingSave {
	name: string;
	description: string;
	backendIds: string[];
	activeBackendId: string;
}

export function BackendGroupDialog({ onClose, editGroupId }: IBackendGroupDialogProps) {
	const { toast } = useToast();
	const group = editGroupId ? useStore((s) => s.backendGroups[editGroupId]) : undefined;
	const backends = useStore((s) => s.backends);
	const servers = useStore((s) => s.servers);

	const isEdit = !!group;
	const backendList = useMemo(() => Object.values(backends), [backends]);
	const serverList = useMemo(() => Object.values(servers), [servers]);

	const [name, setName] = useState(group?.name ?? '');
	const [description, setDescription] = useState(group?.description ?? '');
	const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>(group?.backendIds ?? []);
	const [activeBackendId, setActiveBackendId] = useState<string>(group?.activeBackendId ?? '');
	const [saving, setSaving] = useState(false);

	const [showActivateDialog, setShowActivateDialog] = useState(false);
	const [pendingSave, setPendingSave] = useState<IPendingSave | null>(null);
	const originalActiveBackendId = group?.activeBackendId ?? null;

	const hasActiveChange = isEdit && activeBackendId !== originalActiveBackendId;

	const affectedServers = useMemo(() => {
		if (!isEdit || !hasActiveChange || !group) return [];
		return serverList.filter(s => s.backendGroupId === group.id && s.status === EServerStatus.RUNNING);
	}, [isEdit, hasActiveChange, group, serverList]);

	const handleShowActivateDialog = useCallback(() => {
		setShowActivateDialog(true);
	}, []);

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

		if (hasActiveChange && group && affectedServers.length > 0) {
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
			? await updateBackendGroup(group!.id, updatePayload)
			: await createBackendGroup(createPayload);

		setSaving(false);
		if (result.ok) {
			toast('success', isEdit ? `Group "${saveData.name}" updated` : `Group "${saveData.name}" created`);
			onClose();
		} else {
			toast('error', result.error ?? (isEdit ? 'Failed to update group' : 'Failed to create group'));
		}
	};

	const handleActivationComplete = useCallback(() => {
		if (!pendingSave || !group) return;
		completeSave(pendingSave);
	}, [pendingSave, group]);

	const canSave = name.trim() && selectedBackendIds.length > 0 && !saving && !showActivateDialog;

	return (
		<>
			<Box position="fixed" inset="6px" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius="12px" overflow="hidden">
				<Box position="absolute" inset="0" bg="var(--w-backends-groupdialog-overlay)" backdropFilter="blur(8px)" onClick={() => !saving && !showActivateDialog && onClose()} />
				<Box position="relative" w="580px" maxH="90vh" bg="var(--w-backends-groupdialog-bg)" borderWidth="1px" borderColor="var(--w-backends-groupdialog-border)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
					<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--w-backends-groupdialog-header-border)" bg="var(--w-backends-groupdialog-header-bg)">
						<HStack gap="3">
							<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--w-backends-groupdialog-icon-bg)" borderWidth="1px" borderColor="var(--w-backends-groupdialog-icon-border)">
								<Layers size={18} color="var(--w-backends-groupdialog-icon-color)" />
							</Flex>
							<Box>
								<Text fontSize="16px" fontWeight="700" color="var(--w-backends-groupdialog-title)">{isEdit ? 'Edit Backend Group' : 'Create Backend Group'}</Text>
								<Text fontSize="12px" color="var(--w-backends-groupdialog-subtitle)">{isEdit ? 'Modify group settings and members' : 'Group multiple backends for easy switching'}</Text>
							</Box>
						</HStack>
						<Button size="sm" variant="ghost" color="var(--w-backends-groupdialog-close-color)" _hover={{ color: 'var(--w-backends-groupdialog-close-hover-color)', bg: 'var(--w-backends-groupdialog-close-hover-bg)' }} borderRadius="md" onClick={() => !saving && !showActivateDialog && onClose()} minW="8" px="0" disabled={saving || showActivateDialog}>
							<X size={16} />
						</Button>
					</Flex>

					<Box flex="1" overflowY="auto" p="6">
						<VStack align="stretch" gap="5">
							<Box>
								<Text fontSize="11px" color="var(--w-backends-groupdialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Group Name</Text>
								<Input placeholder="e.g. ROCm Backends" size="sm" bg="var(--w-backends-groupdialog-input-bg)" borderColor="var(--w-backends-groupdialog-input-border)" color="var(--w-backends-groupdialog-input-color)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--w-backends-groupdialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-groupdialog-input-focus)', outline: 'none' }} value={name} onChange={e => setName(e.target.value)} disabled={saving || showActivateDialog} />
							</Box>

							<Box>
								<Text fontSize="11px" color="var(--w-backends-groupdialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
								<Input placeholder="Notes about this group..." size="sm" bg="var(--w-backends-groupdialog-input-bg)" borderColor="var(--w-backends-groupdialog-input-border)" color="var(--w-backends-groupdialog-input-color)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--w-backends-groupdialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-groupdialog-input-focus)', outline: 'none' }} value={description} onChange={e => setDescription(e.target.value)} disabled={saving || showActivateDialog} />
							</Box>

							<Box>
								<Text fontSize="11px" color="var(--w-backends-groupdialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Backends</Text>
								<VStack align="stretch" gap="2" maxH="200px" overflowY="auto">
									{backendList.map(backend => {
										const isSelected = selectedBackendIds.includes(backend.id);
										const isCurrentActive = originalActiveBackendId === backend.id;
										return (
											<HStack key={backend.id} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'var(--w-backends-groupdialog-select-bg)' : 'var(--w-backends-groupdialog-select-inactive-bg)'} borderWidth="1px" borderColor={isSelected ? 'var(--w-backends-groupdialog-select-border)' : 'var(--w-backends-groupdialog-select-inactive-border)'} onClick={() => !saving && !showActivateDialog && handleToggleBackend(backend.id)}>
												<Flex w="5" h="5" borderRadius="md" bg={isSelected ? 'var(--w-backends-groupdialog-check-bg)' : 'var(--w-backends-groupdialog-check-inactive-bg)'} alignItems="center" justifyContent="center">
													{isSelected && <CheckCircle size={10} color="var(--w-backends-groupdialog-checkmark)" />}
												</Flex>
												<Text fontSize="12px" color="var(--w-backends-groupdialog-select-name)" flex="1">{backend.name}</Text>
												{isCurrentActive && (
													<Text fontSize="10px" color="var(--w-backends-groupdialog-current-active)" fontWeight="500">CURRENT ACTIVE</Text>
												)}
											</HStack>
										);
									})}
								</VStack>
							</Box>

							{selectedBackendIds.length > 0 && (
								<Box>
									<Text fontSize="11px" color="var(--w-backends-groupdialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Select Active Backend</Text>
									<VStack align="stretch" gap="2">
										{selectedBackendIds.map(backendId => {
											const backend = backends[backendId];
											if (!backend) return null;
											const isSelected = activeBackendId === backendId;
											const isCurrentActive = originalActiveBackendId === backendId;
											return (
												<HStack key={backendId} px="3" py="2" borderRadius="md" cursor="pointer" bg={isSelected ? 'var(--w-backends-groupdialog-active-bg)' : 'var(--w-backends-groupdialog-active-inactive-bg)'} borderWidth="1px" borderColor={isSelected ? 'var(--w-backends-groupdialog-active-border)' : 'var(--w-backends-groupdialog-active-inactive-border)'} onClick={() => !saving && !showActivateDialog && setActiveBackendId(backendId)}>
													<Flex w="5" h="5" borderRadius="md" bg={isSelected ? 'var(--w-backends-groupdialog-activecheck-bg)' : 'var(--w-backends-groupdialog-activecheck-inactive-bg)'} alignItems="center" justifyContent="center">
														{isSelected && <CheckCircle size={10} color="var(--w-backends-groupdialog-checkmark)" />}
													</Flex>
													<Text fontSize="12px" color="var(--w-backends-groupdialog-active-name)" flex="1">{backend.name}</Text>
													{isCurrentActive && !isSelected && (
														<Text fontSize="10px" color="var(--w-backends-groupdialog-current-label)" fontWeight="500">CURRENT</Text>
													)}
													{isSelected && hasActiveChange && (
														<Text fontSize="10px" color="var(--w-backends-groupdialog-new-active)" fontWeight="500">NEW ACTIVE</Text>
													)}
												</HStack>
											);
										})}
									</VStack>
								</Box>
							)}
						</VStack>
					</Box>

					<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="var(--w-backends-groupdialog-footer-border)" bg="var(--w-backends-groupdialog-footer-bg)">
						<Button size="sm" variant="ghost" color="var(--w-backends-groupdialog-cancel-color)" _hover={{ color: 'var(--w-backends-groupdialog-cancel-hover-color)', bg: 'var(--w-backends-groupdialog-cancel-hover-bg)' }} borderRadius="lg" fontSize="13px" onClick={() => !saving && !showActivateDialog && onClose()} disabled={saving || showActivateDialog}>Cancel</Button>
						<Button size="sm" disabled={!canSave} bg="var(--w-backends-groupdialog-save-bg)" color="var(--w-backends-groupdialog-save-color)" borderWidth="1px" borderColor="var(--w-backends-groupdialog-save-border)" _hover={{ bg: 'var(--w-backends-groupdialog-save-hover)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleSave}>
							{saving ? <Spinner size="xs" /> : <Layers size={14} />}
							{isEdit ? 'Save Changes' : 'Create Group'}
						</Button>
					</Flex>
				</Box>
			</Box>

			{showActivateDialog && pendingSave && group && (
				<Portal>
					<ActivateBackendDialog
						isOpen={true}
						onClose={() => setShowActivateDialog(false)}
						groupId={group.id}
						newBackendId={activeBackendId}
						onComplete={handleActivationComplete}
					/>
				</Portal>
			)}
		</>
	);
}
