import { useState, useCallback, useMemo } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button, Spinner, Badge } from '@chakra-ui/react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { restartServer, activateBackendInGroup } from '../../api/services';
import { useStore } from '../../store';
import type { TBackendId, TBackendGroupId } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';

interface IActivateBackendDialogProps {
	isOpen: boolean;
	onClose: () => void;
	groupId: TBackendGroupId;
	newBackendId: TBackendId;
	onComplete?: () => void;
}

interface IServerState {
	id: string;
	name: string;
	port: number;
	status: 'idle' | 'restarting' | 'completed' | 'failed';
	error?: string;
}

export function ActivateBackendDialog({ isOpen, onClose, groupId, newBackendId, onComplete }: IActivateBackendDialogProps) {
	const { toast } = useToast();
	const group = useStore((s) => s.backendGroups[groupId]);
	const backends = useStore((s) => s.backends);
	const servers = useStore((s) => s.servers);

	const [open, setOpen] = useState(isOpen);
	const [isSwitching, setIsSwitching] = useState(false);
	const [switchingDone, setSwitchingDone] = useState(false);
	const [isRestarting, setIsRestarting] = useState(false);

	const newBackend = useMemo(() => backends[newBackendId], [backends, newBackendId]);
	const currentBackend = useMemo(() => group ? backends[group.activeBackendId] : undefined, [group, backends]);

	const affectedServers = useMemo(() => {
		if (!group) return [];
		return Object.values(servers).filter(s => s.backendGroupId === group.id && s.status === EServerStatus.RUNNING);
	}, [group, servers]);

	const [serversState, setServersState] = useState<Record<string, IServerState>>(
		affectedServers.reduce((acc, s) => ({
			...acc,
			[s.id]: { id: s.id, name: s.serverName, port: s.port, status: 'idle' } as IServerState,
		}), {})
	);

	const handleClose = useCallback(() => {
		setOpen(false);
		onClose();
	}, [onClose]);

	const handleCancel = useCallback(() => {
		handleClose();
	}, [handleClose]);

	const handleSwitchOnly = async () => {
		setIsSwitching(true);
		try {
			const result = await activateBackendInGroup(groupId, newBackendId);
			if (result.ok) {
				toast('success', 'The active backend for this group has been updated.');
				handleClose();
				onComplete?.();
			} else {
				toast('error', result.error ?? 'Unable to update the active backend. Please try again.');
				setIsSwitching(false);
			}
		} catch {
			toast('error', 'Unable to update the active backend. Please try again.');
			setIsSwitching(false);
		}
	};

	const handleSwitchAndRestart = async () => {
		setIsSwitching(true);
		setIsRestarting(true);

		try {
			const result = await activateBackendInGroup(groupId, newBackendId);
			if (!result.ok) {
				toast('error', result.error ?? 'Unable to update the active backend.');
				setIsSwitching(false);
				setIsRestarting(false);
				return;
			}
			setSwitchingDone(true);

			if (Object.keys(serversState).length === 0) {
				toast('success', 'The active backend for this group has been updated.');
				handleClose();
				onComplete?.();
				return;
			}

			setServersState(prev => {
				const newState: Record<string, IServerState> = {};
				for (const s of Object.values(prev)) {
					newState[s.id] = { ...s, status: 'restarting' as const };
				}
				return newState;
			});

			const restartPromises = Object.values(serversState).map(async (server) => {
				try {
					await restartServer(server.id);
					setServersState(prev => {
						const existing = prev[server.id];
						if (!existing) return prev;
						return {
							...prev,
							[server.id]: { id: existing.id, name: existing.name, port: existing.port, status: 'completed' },
						};
					});
				} catch {
					setServersState(prev => {
						const existing = prev[server.id];
						if (!existing) return prev;
						return {
							...prev,
							[server.id]: { id: existing.id, name: existing.name, port: existing.port, status: 'failed', error: 'Restart failed' },
						};
					});
				}
			});

			await Promise.all(restartPromises);

			toast('success', 'The active backend has been updated and servers restarted.');
			handleClose();
			onComplete?.();
		} catch {
			toast('error', 'Unable to update the active backend.');
			setIsSwitching(false);
			setIsRestarting(false);
		}
	};

	const allCompleted = Object.keys(serversState).length > 0 && Object.values(serversState).every(s => s.status === 'completed' || s.status === 'failed');

	return (
		<Dialog.Root open={open} onOpenChange={(details) => { if (!isSwitching && !isRestarting) setOpen(details.open); }}>
			<Portal>
				<Box position="fixed" inset="6px" borderRadius="12px" overflow="hidden" zIndex="modal">
					<Dialog.Backdrop position="absolute" />
					<Dialog.Positioner position="absolute">
						<Dialog.Content
							maxW="520px"
							bg="var(--w-backends-activate-dialog-bg)"
							borderColor="var(--w-backends-activate-dialog-border)"
							borderRadius="2xl"
						shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
					>
						<VStack gap="4" px="6" py="5">
							<Box w="10" h="10" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="var(--w-backends-activate-icon-bg)">
								<AlertTriangle size={20} color="var(--w-backends-activate-icon-color)" />
							</Box>

							<VStack gap="2">
								<Dialog.Title fontSize="16px" fontWeight="700" color="var(--w-backends-activate-title)">
									Switch Active Backend?
								</Dialog.Title>
								<Text fontSize="13px" color="var(--w-backends-activate-desc)" textAlign="center">
									Changing from <Text as="span" color="var(--w-backends-activate-desc-highlight)" fontWeight="500">{currentBackend?.name ?? '(deleted)'}</Text> to <Text as="span" color="var(--w-backends-activate-desc-highlight)" fontWeight="500">{newBackend?.name ?? '(deleted)'}</Text>
								</Text>
							</VStack>

							{Object.keys(serversState).length > 0 ? (
								<Box>
									<Text fontSize="12px" color="var(--w-backends-activate-server-label)" mb="2">
										Affected running servers ({Object.keys(serversState).length}):
									</Text>
									<Box
										borderWidth="1px"
										borderColor="var(--w-backends-activate-serverlist-border)"
										borderRadius="lg"
										p="2"
										maxH="200px"
										overflowY="auto"
									>
										<VStack gap="1" align="stretch">
											{Object.values(serversState).map((server) => (
												<HStack
													key={server.id}
													justify="space-between"
													px="2"
													py="1.5"
													borderRadius="md"
													bg={
														server.status === 'restarting'
															? 'var(--w-backends-activate-row-restarting-bg)'
															: server.status === 'completed'
															? 'var(--w-backends-activate-row-completed-bg)'
															: server.status === 'failed'
															? 'var(--w-backends-activate-row-failed-bg)'
															: 'transparent'
													}
													borderWidth="1px"
													borderColor={
														server.status === 'restarting'
															? 'var(--w-backends-activate-row-restarting-border)'
															: server.status === 'completed'
															? 'var(--w-backends-activate-row-completed-border)'
															: server.status === 'failed'
															? 'var(--w-backends-activate-row-failed-border)'
															: 'transparent'
													}
													transition="all 0.2s ease"
												>
													<HStack gap="2">
														{server.status === 'restarting' && (
															<Spinner size="xs" color="var(--w-backends-activate-spinner)" />
														)}
														{server.status === 'completed' && (
															<CheckCircle size={14} color="var(--w-backends-activate-completed-icon)" />
														)}
														{server.status === 'failed' && (
															<XCircle size={14} color="var(--w-backends-activate-failed-icon)" />
														)}
														{server.status === 'idle' && (
															<Badge
																px="1.5"
																py="0.25"
																borderRadius="md"
																fontSize="10px"
																bg="var(--w-backends-activate-idle-badge-bg)"
																color="var(--w-backends-activate-idle-badge-color)"
															>
																Port {server.port}
															</Badge>
														)}
														<Text fontSize="12px" color={server.status === 'idle' ? 'var(--w-backends-activate-idle-name)' : 'var(--w-backends-activate-active-name)'} fontWeight={server.status === 'idle' ? '400' : '500'}>
															{server.name}
														</Text>
													</HStack>
													{server.status === 'restarting' && (
														<Text fontSize="11px" color="var(--w-backends-activate-restarting-text)" fontWeight="500">
															Restarting...
														</Text>
													)}
													{server.status === 'completed' && (
														<Text fontSize="11px" color="var(--w-backends-activate-completed-text)" fontWeight="500">
															Restarted
														</Text>
													)}
													{server.status === 'failed' && (
														<Text fontSize="11px" color="var(--w-backends-activate-failed-text)" fontWeight="500">
															Failed
														</Text>
													)}
												</HStack>
											))}
										</VStack>
									</Box>
								</Box>
							) : (
								<Text fontSize="12px" color="var(--w-backends-activate-no-servers)" textAlign="center" py="2">
									No running servers using this group
								</Text>
							)}

							<HStack gap="2" w="100%" pt="2">
								<Button
									flex="1"
									size="sm"
									variant="ghost"
									color="var(--w-backends-activate-cancel-color)"
									_hover={{ color: 'var(--w-backends-activate-cancel-hover-color)', bg: 'var(--w-backends-activate-cancel-hover-bg)' }}
									borderRadius="lg"
									fontSize="13px"
									onClick={handleCancel}
									disabled={isSwitching && !switchingDone}
								>
									Cancel
								</Button>
								<Button
									flex="1"
									size="sm"
									bg="var(--w-backends-activate-switch-bg)"
									color="var(--w-backends-activate-switch-color)"
									borderWidth="1px"
									borderColor="var(--w-backends-activate-switch-border)"
									_hover={{ bg: 'var(--w-backends-activate-switch-hover)' }}
									borderRadius="lg"
									fontSize="13px"
									fontWeight="500"
									onClick={handleSwitchOnly}
									disabled={isSwitching || switchingDone}
								>
									{isSwitching ? <Spinner size="xs" /> : 'Switch Only'}
								</Button>
								{affectedServers.length > 0 && (
									<Button
										flex="1"
										size="sm"
										bg="var(--w-backends-activate-restart-bg)"
										color="var(--w-backends-activate-restart-color)"
										borderWidth="1px"
										borderColor="var(--w-backends-activate-restart-border)"
										_hover={{ bg: 'var(--w-backends-activate-restart-hover)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={handleSwitchAndRestart}
										disabled={isSwitching || switchingDone || isRestarting}
									>
										{isRestarting ? (
											<HStack gap="1">
												<Spinner size="xs" />
												<Text>Restarting...</Text>
											</HStack>
										) : (
											'Switch & Restart'
										)}
									</Button>
								)}
							</HStack>
						</VStack>
					</Dialog.Content>
					</Dialog.Positioner>
				</Box>
			</Portal>
		</Dialog.Root>
	);
}
