import { useState, useCallback } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button, Spinner, Badge } from '@chakra-ui/react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { restartServer, activateBackendInGroup } from '../../api/services';
import type { IBackend, IBackendGroup, IServer } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';

interface IActivateBackendDialogProps {
	isOpen: boolean;
	onClose: () => void;
	groupId: string;
	group: IBackendGroup;
	newBackendId: string;
	newBackend: IBackend;
	currentBackend?: IBackend;
	affectedServers: IServer[];
	onSwitchOnly?: () => Promise<void>;
	onSwitchAndRestart?: () => Promise<void>;
}

interface IServerState {
	id: string;
	name: string;
	port: number;
	status: 'idle' | 'restarting' | 'completed' | 'failed';
	error?: string;
}

export function ActivateBackendDialog({ isOpen, onClose, groupId, group, newBackendId, newBackend, currentBackend, affectedServers, onSwitchOnly, onSwitchAndRestart }: IActivateBackendDialogProps) {
	const { toast } = useToast();
	const [open, setOpen] = useState(isOpen);
	const [isSwitching, setIsSwitching] = useState(false);
	const [switchingDone, setSwitchingDone] = useState(false);
	const [serversState, setServersState] = useState<Record<string, IServerState>>(
		affectedServers.reduce((acc, s) => ({
			...acc,
			[s.id]: { id: s.id, name: s.serverName, port: s.port, status: 'idle' } as IServerState,
		}), {})
	);
	const [isRestarting, setIsRestarting] = useState(false);

	const resetState = useCallback(() => {
		setIsSwitching(false);
		setSwitchingDone(false);
		setServersState(
			affectedServers.reduce((acc, s) => ({
				...acc,
				[s.id]: { id: s.id, name: s.serverName, port: s.port, status: 'idle' } as IServerState,
			}), {})
		);
		setIsRestarting(false);
	}, [affectedServers]);

	const handleClose = useCallback(() => {
		setOpen(false);
		onClose();
	}, [onClose]);

	const handleCancel = useCallback(() => {
		resetState();
		handleClose();
	}, [resetState, handleClose]);

	const handleSwitchOnly = async () => {
	if (onSwitchOnly) {
		await onSwitchOnly();
		return;
	}
	setIsSwitching(true);
	try {
		await activateBackendInGroup(groupId, newBackendId);
		toast('success', 'The active backend for this group has been updated.');
		resetState();
		handleClose();
	} catch (error) {
		toast('error', 'Unable to update the active backend. Please try again.');
		setIsSwitching(false);
	}
};

const handleSwitchAndRestart = async () => {
	if (onSwitchAndRestart) {
		await onSwitchAndRestart();
		return;
	}
	setIsSwitching(true);
	setIsRestarting(true);

	try {
		await activateBackendInGroup(groupId, newBackendId);
		setSwitchingDone(true);

		if (Object.keys(serversState).length === 0) {
			toast('success', 'The active backend for this group has been updated.');
			resetState();
			handleClose();
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
			} catch (error) {
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
		resetState();
		handleClose();
	} catch (error) {
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
							bg="#0f0f12"
							borderColor="rgba(255, 255, 255, 0.08)"
							borderRadius="2xl"
						shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
					>
						<VStack gap="4" px="6" py="5">
							<Box w="10" h="10" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="rgba(251, 113, 133, 0.12)">
								<AlertTriangle size={20} color="#fb7185" />
							</Box>

							<VStack gap="2">
								<Dialog.Title fontSize="16px" fontWeight="700" color="#e4e4e7">
									Switch Active Backend?
								</Dialog.Title>
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.5)" textAlign="center">
									Changing from <Text as="span" color="#e4e4e7" fontWeight="500">{currentBackend?.name ?? '(deleted)'}</Text> to <Text as="span" color="#e4e4e7" fontWeight="500">{newBackend.name}</Text>
								</Text>
							</VStack>

							{Object.keys(serversState).length > 0 ? (
								<Box>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" mb="2">
										Affected running servers ({Object.keys(serversState).length}):
									</Text>
									<Box
										borderWidth="1px"
										borderColor="rgba(255, 255, 255, 0.06)"
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
															? 'rgba(51, 129, 255, 0.08)'
															: server.status === 'completed'
															? 'rgba(52, 211, 153, 0.08)'
															: server.status === 'failed'
															? 'rgba(251, 113, 133, 0.08)'
															: 'transparent'
													}
													borderWidth="1px"
													borderColor={
														server.status === 'restarting'
															? 'rgba(51, 129, 255, 0.2)'
															: server.status === 'completed'
															? 'rgba(52, 211, 153, 0.2)'
															: server.status === 'failed'
															? 'rgba(251, 113, 133, 0.2)'
															: 'transparent'
													}
													transition="all 0.2s ease"
												>
													<HStack gap="2">
														{server.status === 'restarting' && (
															<Spinner size="xs" color="#3381ff" />
														)}
														{server.status === 'completed' && (
															<CheckCircle size={14} color="#34d399" />
														)}
														{server.status === 'failed' && (
															<XCircle size={14} color="#fb7185" />
														)}
														{server.status === 'idle' && (
															<Badge
																px="1.5"
																py="0.25"
																borderRadius="md"
																fontSize="10px"
																bg="rgba(255, 255, 255, 0.06)"
																color="rgba(255, 255, 255, 0.4)"
															>
																Port {server.port}
															</Badge>
														)}
														<Text fontSize="12px" color={server.status === 'idle' ? 'rgba(255, 255, 255, 0.7)' : '#e4e4e7'} fontWeight={server.status === 'idle' ? '400' : '500'}>
															{server.name}
														</Text>
													</HStack>
													{server.status === 'restarting' && (
														<Text fontSize="11px" color="#3381ff" fontWeight="500">
															Restarting...
														</Text>
													)}
													{server.status === 'completed' && (
														<Text fontSize="11px" color="#34d399" fontWeight="500">
															Restarted
														</Text>
													)}
													{server.status === 'failed' && (
														<Text fontSize="11px" color="#fb7185" fontWeight="500">
															Failed
														</Text>
													)}
												</HStack>
											))}
										</VStack>
									</Box>
								</Box>
							) : (
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)" textAlign="center" py="2">
									No running servers using this group
								</Text>
							)}

							<HStack gap="2" w="100%" pt="2">
								<Button
									flex="1"
									size="sm"
									variant="ghost"
									color="rgba(255, 255, 255, 0.4)"
									_hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }}
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
									bg="rgba(51, 129, 255, 0.12)"
									color="#3381ff"
									borderWidth="1px"
									borderColor="rgba(51, 129, 255, 0.25)"
									_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
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
										bg="rgba(167, 139, 250, 0.12)"
										color="#a78bfa"
										borderWidth="1px"
										borderColor="rgba(167, 139, 250, 0.25)"
										_hover={{ bg: 'rgba(167, 139, 250, 0.2)' }}
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
