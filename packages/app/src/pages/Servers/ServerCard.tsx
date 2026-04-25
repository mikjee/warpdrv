import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, HStack, VStack, Flex, Button, Badge, Input, Portal, Popover, HoverCard, Icon } from '@chakra-ui/react';
import {
	Play, Square, RotateCcw, Server, Clock, Trash2, X, Plus,
	Activity, Gauge, Cpu, Blocks, Terminal, Edit, Sparkles, Save, Zap
} from 'lucide-react';
import { LuSaveOff } from "react-icons/lu";
import { GoEyeClosed } from "react-icons/go";
import { FaBrain, FaBookOpen, FaRegEye } from 'react-icons/fa6';
import { Card } from '@/components/Card';
import { StatusBadge } from '@/pages/Servers/StatusBadge';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useMutation } from '@/hooks/useQuery';
import { useStore } from '@/store';
import { stopServer, restartServer, updateServer, clearStickyRoute } from '@/api/services';
import type { IServer, IBackend, IBackendGroup, IModel, TServerId } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { formatUptime, formatCount, QUANT_COLORS, StatPill } from './utils';
import { ServerSlots } from '@/pages/Servers/SlotPill';

interface IServerCardProps {
	serverId: TServerId;
	modelByPath: Record<string, IModel>,
	onShowLogs: (serverId: string) => void;
	onEdit: (serverId: string) => void;
	onSaveCheckpoint: (serverId: string) => void;
	onLoadCheckpoint: (serverId: string) => void;
	onConfirmDelete: (serverId: string) => void;
}

export const ServerCard = React.memo(({
	serverId,
	modelByPath,
	onShowLogs,
	onEdit,
	onSaveCheckpoint,
	onLoadCheckpoint,
	onConfirmDelete,
}: IServerCardProps) => {
	const server = useStore((s) => s.servers[serverId])!;
	const group = useStore((s) => server.backendGroupId ? s.backendGroups[server.backendGroupId] : null);

	const isRunning = server.status === EServerStatus.RUNNING;
	const isLoading = server.status === EServerStatus.LOADING;
	const hasMmproj = modelByPath[server.modelPath]?.mmprojFile;
	const showCheckpointButtons = !hasMmproj || !server.useMultiModal;

	const backend = useStore((s) => 
		group?.activeBackendId 
			? s.backends[group.activeBackendId] 
			: server.backendId 
				? s.backends[server.backendId] 
				: null
	);

	// Stop/restart
	const { mutate: stopMut } = useMutation<string, IServer>(useCallback((id: string) => stopServer(id), []));
	const { mutate: restartMut} = useMutation<string, IServer>(useCallback((id: string) => restartServer(id), []));

	const handleStop = useCallback(async () => { await stopMut(serverId); }, [stopMut, serverId]);
	const handleRestart = useCallback(async () => { await restartMut(serverId); }, [restartMut, serverId]);

	// Alias management
	const [removingAlias, setRemovingAlias] = useState<string | null>(null);
	const [addingAliasOpen, setAddingAliasOpen] = useState(false);
	const [newAliasValue, setNewAliasValue] = useState('');

	const updateCallback = useCallback(([id, data]: Array<any>) => updateServer(id, data, false), []);
	const {
		mutate: updateMut,
		loading,
	} = useMutation<[string, Partial<Pick<IServer, 'serverAlias'>>], IServer>(updateCallback);

	const handleRemoveAlias = useCallback(async () => {
		if (!removingAlias) return;
		await clearStickyRoute(removingAlias).catch(() => {});
		const newAliases = (server.serverAlias ?? []).filter(a => a !== removingAlias);
		await updateMut([serverId, { serverAlias: newAliases }]);
		setRemovingAlias(null);
	}, [removingAlias, server, updateMut, serverId]);

	const handleAddAlias = useCallback(async () => {
		if (!newAliasValue.trim()) return;
		const existingAliases = server.serverAlias ?? [];
		const newAliasesToAdd: string[] = [];
		newAliasValue.split(',').forEach(part => {
			const alias = part.trim();
			if (alias && !existingAliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
				newAliasesToAdd.push(alias);
			}
		});
		if (newAliasesToAdd.length > 0) {
			await updateMut([serverId, { serverAlias: [...existingAliases, ...newAliasesToAdd] }]);
		}
		setAddingAliasOpen(false);
		setNewAliasValue('');
	}, [newAliasValue, server, updateMut, serverId]);

	// Helper functions
	const getDeviceName = useCallback((): string => {
		const device = backend?.detectedDevices.find(d => d.id === server.params.device);
		if (device) return `${device.name} (${device.id})`;
		if (server.params.device) return server.params.device;

		const firstDevice = backend?.detectedDevices[0];
		return firstDevice ? `${firstDevice.name} (${firstDevice.id})` : 'Default';
	}, [backend, server]);

	const getModelMaxContext = useCallback((): number | null => {
		return modelByPath[server.modelPath]?.primaryFile?.metadata?.contextLength ?? null;
	}, [modelByPath, server]);

	const model = modelByPath[server.modelPath];
	const draftModel = server.params.specDecode?.draftModelPath ? modelByPath[server.params.specDecode.draftModelPath] : null;
	const deviceName = useMemo(getDeviceName, [getDeviceName]);
	const modelMaxCtx = useMemo(getModelMaxContext, [getModelMaxContext]);
	const configuredCtx = server.params.contextSize;
	const displayCtx = useMemo(() => configuredCtx === 0 ? (modelMaxCtx ? formatCount(modelMaxCtx) : 'auto') : formatCount(configuredCtx), [configuredCtx, modelMaxCtx]);
	const backendName = useMemo(() => group?.name ? `${group.name} (${backend?.name ?? 'Unknown'})` : backend?.name ?? "Backend Not Found!", [group, backend]);

	return (
		<Card
			p="3"
			hasGradient={isRunning || isLoading}
			gradientFrom={isRunning ? "rgba(52, 211, 153, 0.05)" : "rgba(251, 191, 36, 0.025)"}
			gradientTo="transparent"
			borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : isLoading ? 'rgba(251, 191, 36, 0.3)' : undefined}
		>
			<VStack align="stretch" gap="2.5">
				<Flex justify="space-between" align="start">
					<HStack gap="3" pr="3">
						<Flex
							w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
							position="relative"
							bg={isRunning ? 'rgba(52, 211, 153, 0.06)' : isLoading ? 'rgba(251, 191, 36, 0.06)' : 'rgba(255, 255, 255, 0.04)'}
							borderWidth="1px"
							borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : isLoading ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
						>
							<Server size={18} color={isRunning ? '#34d399' : isLoading ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)'} />
						</Flex>
						<Box>
							<HStack gap="3" alignItems="center" flexWrap="wrap">
								<HoverCard.Root size="sm" openDelay={150}>
									<HoverCard.Trigger asChild>
										<Text fontSize="13px" fontWeight="600" color="#d0d0d0" cursor="help">{server.serverName}</Text>
									</HoverCard.Trigger>
									<Portal>
										<HoverCard.Positioner>
											<HoverCard.Content
												bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
												borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="3"
												maxW="500px"
											>
												<VStack align="stretch" gap="2">
													<Box
														fontSize="10px" fontFamily='"Geist Mono", monospace' color="rgba(255, 255, 255, 0.7)"
														bg="rgba(255, 255, 255, 0.03)" borderRadius="md" p="2.5"
														whiteSpace="pre-wrap" wordBreak="break-all" lineHeight="1.4"
													>
														{server.launchCommand}
													</Box>
												</VStack>
											</HoverCard.Content>
										</HoverCard.Positioner>
									</Portal>
								</HoverCard.Root>
								<StatusBadge status={server.status as EServerStatus} port={server.port} />
								{server.serverAlias && server.serverAlias.length > 0 && (
									<>
										{server.serverAlias.map(alias => (
											<Badge key={alias} px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(99, 102, 241, 0.15)" color="#a5b4fc" borderWidth="1px" borderColor="rgba(99, 102, 241, 0.3)">
												{alias}
												<Button
													size="xs"
													variant="ghost"
													p="0"
													minW="auto"
													h="14px"
													w="14px"
													ml="2"
													color="#a5b4fc"
													_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.1)' }}
													borderRadius="md"
													onClick={(e) => { e.stopPropagation(); setRemovingAlias(alias); }}
												>
													<X size={9} />
												</Button>
											</Badge>
										))}
									</>
								)}
								<Popover.Root lazyMount unmountOnExit open={addingAliasOpen} onOpenChange={(details) => { if (!details.open) { setAddingAliasOpen(false); setNewAliasValue(''); } }}>
									<Popover.Trigger asChild>
										<Badge px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(99, 102, 241, 0.1)" color="#a5b4fc" borderWidth="1px" borderColor="rgba(99, 102, 241, 0.25)" cursor="pointer" onClick={(e) => { e.stopPropagation(); setAddingAliasOpen(true); }}>
											<Plus size={10} />
										</Badge>
									</Popover.Trigger>
									<Portal>
										<Popover.Positioner>
											<Popover.Content maxW="320px" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)">
												<Popover.Arrow />
												<Popover.Body p="4">
													<Text fontSize="12px" fontWeight="medium" color="#e4e4e7" mb="3">Add alias for "{server.serverName}"</Text>
													<HStack gap="2">
														<Input
															value={newAliasValue}
															onChange={(e) => setNewAliasValue(e.target.value)}
															onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
															placeholder="Enter comma separated aliases..."
															size="sm"
															bg="rgba(255, 255, 255, 0.03)"
															borderColor="rgba(255, 255, 255, 0.1)"
															color="#e4e4e7"
															fontSize="12px"
															_placeholder={{ color: 'rgba(255, 255, 255, 0.3)' }}
														/>
														<Button
															size="sm"
															bgGradient="to-r"
															gradientFrom="#3381ff"
															gradientTo="#5b6af5"
															color="white"
															fontSize="12px"
															onClick={handleAddAlias}
														>
															Add
														</Button>
													</HStack>
												</Popover.Body>
											</Popover.Content>
										</Popover.Positioner>
									</Portal>
								</Popover.Root>
								{isRunning && (
									<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
										<Clock size={11} />
										<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
									</HStack>
								)}
							</HStack>
							<HStack gap="2.5" flexWrap="wrap" mt="1.5">
								<HStack gap="1">
									<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? "Model Not Found!"} />
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="#ecbf42" boxSize="14px" ml="1" mr="1"><FaRegEye /></Icon>
									)}
									{model?.mmprojFile && !server.useMultiModal && (
										<Icon color="#ec4242" boxSize="14px" ml="1" mr="1"><GoEyeClosed /></Icon>
									)}
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="#ec4242" boxSize="14px" ml="1" mr="1"><LuSaveOff /></Icon>
									)}
									{model?.primaryFile?.metadata?.quantType && (
										<Badge
											px="1.5" py="0.25" borderRadius="md" fontSize="10px"
											fontFamily='"Geist Mono", monospace'
											bg={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 15%, transparent)`}
											color={QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.5)'}
											borderWidth="1px"
											borderColor={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 30%, transparent)`}
										>
											{model.primaryFile.metadata.quantType}
										</Badge>
									)}
								</HStack>
								{server.params.specDecode?.enabled && draftModel && (
									<StatPill icon={<Sparkles size={12} />} label="Draft" value={draftModel.name} />
								)}
								<StatPill icon={<Blocks size={12} />} label="Backend" value={backendName} />
								<StatPill icon={<Cpu size={12} />} label="Device" value={deviceName} />
								<StatPill icon={<FaBookOpen size={12} />} label="Context" value={`${displayCtx}`} />
							</HStack>
							{server.error && (
								<Text fontSize="11px" color="#fb7185" lineClamp={1} mt="0.5">{server.error}</Text>
							)}
						</Box>
					</HStack>

					<HStack gap="1" my="auto" pl="3">
						{showCheckpointButtons && <Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => onLoadCheckpoint(serverId)}>
							<Zap size={14} />
						</Button>}
						{isRunning && showCheckpointButtons && (
							<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => onSaveCheckpoint(serverId)}>
								<Save size={14} />
							</Button>
						)}
						<Box w="1px" h="16px" bg="rgba(255, 255, 255, 0.08)" my="auto" />
						{!isRunning && !isLoading && (
							<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={handleRestart}>
								<Play size={14} />
							</Button>
						)}
						{(isRunning || isLoading) && (
							<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={handleRestart}>
								<RotateCcw size={14} />
							</Button>
						)}
						<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.08)' }} borderRadius="md" onClick={() => onShowLogs(serverId)}>
							<Terminal size={14} />
						</Button>
						<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => onEdit(serverId)}>
							<Edit size={14} />
						</Button>
						<Box w="1px" h="16px" bg="rgba(255, 255, 255, 0.08)" my="auto" />
						{(isRunning || isLoading) ? (
							<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={handleStop}>
								<Square size={14} />
							</Button>
						) : (
							<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => onConfirmDelete(serverId)}>
								<Trash2 size={14} />
							</Button>
						)}
					</HStack>
				</Flex>
				<ServerSlots serverId={serverId} />
			</VStack>

			{removingAlias && (
				<ConfirmDialog
					title="Remove Alias?"
					message={`This will remove the alias "${removingAlias}" from the server. This won't affect the running server.`}
					isOpen={true}
					isLoading={loading}
					onCancel={() => setRemovingAlias(null)}
					onConfirm={handleRemoveAlias}
				/>
			)}
		</Card>
	);
});
