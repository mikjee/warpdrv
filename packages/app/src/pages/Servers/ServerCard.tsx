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
			gradientFrom={isRunning ? "var(--w-servers-card-gradient-running)" : "var(--w-servers-card-gradient-loading)"}
			gradientTo="transparent"
			borderColor={isRunning ? 'var(--w-servers-card-border-running)' : isLoading ? 'var(--w-servers-card-border-loading)' : undefined}
		>
			<VStack align="stretch" gap="2.5">
				<Flex justify="space-between" align="start">
					<HStack gap="3" pr="3">
						<Flex
							w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
							position="relative"
							bg={isRunning ? 'var(--w-servers-card-icon-bg-running)' : isLoading ? 'var(--w-servers-card-icon-bg-loading)' : 'var(--w-servers-card-icon-bg-idle)'}
							borderWidth="1px"
							borderColor={isRunning ? 'var(--w-servers-card-icon-border-running)' : isLoading ? 'var(--w-servers-card-icon-border-loading)' : 'var(--w-servers-card-icon-border-idle)'}
						>
							<Server size={18} color={isRunning ? 'var(--w-servers-card-icon-color-running)' : isLoading ? 'var(--w-servers-card-icon-color-loading)' : 'var(--w-servers-card-icon-color-idle)'} />
						</Flex>
						<Box>
							<HStack gap="3" alignItems="center" flexWrap="wrap">
								<HoverCard.Root size="sm" openDelay={150}>
									<HoverCard.Trigger asChild>
										<Text fontSize="13px" fontWeight="600" color="var(--w-servers-card-name)" cursor="help">{server.serverName}</Text>
									</HoverCard.Trigger>
									<Portal>
										<HoverCard.Positioner>
											<HoverCard.Content
												bg="var(--w-servers-card-hovercard-bg)" borderWidth="1px" borderColor="var(--w-servers-card-hovercard-border)"
												borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="3"
												maxW="500px"
											>
												<VStack align="stretch" gap="2">
													<Box
														fontSize="10px" fontFamily='"Geist Mono", monospace' color="var(--w-servers-card-hovercard-text)"
														bg="var(--w-servers-card-hovercard-cmdbg)" borderRadius="md" p="2.5"
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
											<Badge key={alias} px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--w-servers-card-alias-bg)" color="var(--w-servers-card-alias-color)" borderWidth="1px" borderColor="var(--w-servers-card-alias-border)">
												{alias}
												<Button
													size="xs"
													variant="ghost"
													p="0"
													minW="auto"
													h="14px"
													w="14px"
													ml="2"
													color="var(--w-servers-card-alias-remove-color)"
													_hover={{ color: 'var(--w-servers-card-alias-remove-hover)', bg: 'var(--w-servers-card-alias-remove-hoverbg)' }}
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
										<Badge px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--w-servers-card-addalias-bg)" color="var(--w-servers-card-addalias-color)" borderWidth="1px" borderColor="var(--w-servers-card-addalias-border)" cursor="pointer" onClick={(e) => { e.stopPropagation(); setAddingAliasOpen(true); }}  title="Add Alias">
											<Plus size={10} />
										</Badge>
									</Popover.Trigger>
									<Portal>
										<Popover.Positioner>
											<Popover.Content maxW="320px" bg="var(--w-servers-card-popover-bg)" borderWidth="1px" borderColor="var(--w-servers-card-popover-border)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)">
												<Popover.Arrow />
												<Popover.Body p="4">
													<Text fontSize="12px" fontWeight="medium" color="var(--w-servers-card-popover-title)" mb="3">Add alias for "{server.serverName}"</Text>
													<HStack gap="2">
														<Input
															value={newAliasValue}
															onChange={(e) => setNewAliasValue(e.target.value)}
															onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
															placeholder="Enter comma separated aliases..."
															size="sm"
															bg="var(--w-servers-card-popover-inputbg)"
															borderColor="var(--w-servers-card-popover-inputborder)"
															color="var(--w-servers-card-popover-inputcolor)"
															fontSize="12px"
															_placeholder={{ color: 'var(--w-servers-card-popover-placeholder)' }}
														/>
														<Button
															size="sm"
															bgGradient="to-r"
															gradientFrom="var(--w-servers-card-addbtn-from)"
															gradientTo="var(--w-servers-card-addbtn-to)"
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
									<HStack gap="1" color="var(--w-servers-card-uptime)">
										<Clock size={11} />
										<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
									</HStack>
								)}
							</HStack>
							<HStack gap="2.5" flexWrap="wrap" mt="1.5">
								<HStack gap="1">
									<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? "Model Not Found!"} />
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="var(--w-servers-card-vision-enabled)" boxSize="14px" ml="1" mr="1"><FaRegEye title="Vision"/></Icon>
									)}
									{model?.mmprojFile && !server.useMultiModal && (
										<Icon color="var(--w-servers-card-vision-disabled)" boxSize="14px" ml="1" mr="1"><GoEyeClosed  title="Multi-modal disabled"/></Icon>
									)}
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="var(--w-servers-card-checkpoint-warn)" boxSize="14px" ml="1" mr="1"><LuSaveOff title="Cannot save checkpoints when multi-modal is enabled" /></Icon>
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
								<Text fontSize="11px" color="var(--w-servers-card-error)" lineClamp={1} mt="0.5">{server.error}</Text>
							)}
						</Box>
					</HStack>

					<HStack gap="1" my="auto" pl="3">
						{showCheckpointButtons && <Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-blue)', bg: 'var(--w-servers-card-action-hoverblue-bg)' }} borderRadius="md" onClick={() => onLoadCheckpoint(serverId)} title="Load KV Checkpoint">
							<Zap size={14} />
						</Button>}
						{isRunning && showCheckpointButtons && (
							<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-blue)', bg: 'var(--w-servers-card-action-hoverblue-bg)' }} borderRadius="md" onClick={() => onSaveCheckpoint(serverId)} title="Save KV Checkpoint">
								<Save size={14} />
							</Button>
						)}
						<Box w="1px" h="16px" bg="var(--w-servers-card-divider)" my="auto" />
						{!isRunning && !isLoading && (
							<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-yellow)', bg: 'var(--w-servers-card-action-hoveryellow-bg)' }} borderRadius="md" onClick={handleRestart} title="Launch Server">
								<Play size={14} />
							</Button>
						)}
						{(isRunning || isLoading) && (
							<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-yellow)', bg: 'var(--w-servers-card-action-hoveryellow-bg)' }} borderRadius="md" onClick={handleRestart} title="Restart Server">
								<RotateCcw size={14} />
							</Button>
						)}
						<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-cyan)', bg: 'var(--w-servers-card-action-hovercyan-bg)' }} borderRadius="md" onClick={() => onShowLogs(serverId)} title="Server logs">
							<Terminal size={14} />
						</Button>
						<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-blue)', bg: 'var(--w-servers-card-action-hoverblue-bg)' }} borderRadius="md" onClick={() => onEdit(serverId)} title="Edit Server">
							<Edit size={14} />
						</Button>
						<Box w="1px" h="16px" bg="var(--w-servers-card-divider-2)" my="auto" />
						{(isRunning || isLoading) ? (
							<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-red)', bg: 'var(--w-servers-card-action-hoverred-bg)' }} borderRadius="md" onClick={handleStop}  title="Stop Server">
								<Square size={14} />
							</Button>
						) : (
							<Button size="xs" variant="ghost" color="var(--w-servers-card-action-default)" _hover={{ color: 'var(--w-servers-card-action-hover-red)', bg: 'var(--w-servers-card-action-hoverred-bg)' }} borderRadius="md" onClick={() => onConfirmDelete(serverId)} title="Delete Server">
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
