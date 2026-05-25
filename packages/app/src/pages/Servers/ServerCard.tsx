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
import { formatUptime, formatCount, QUANT_COLORS, StatPill, formatLaunchCommand } from './utils';
import { ServerSlots } from '@/pages/Servers/SlotPill';
import { BsGpuCard } from "react-icons/bs";

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
		// return firstDevice ? `${firstDevice.name} (${firstDevice.id})` : 'Default';
		return firstDevice?.name ?? 'Default';
	}, [backend, server]);

	const getModelMaxContext = useCallback((): number | null => {
		return modelByPath[server.modelPath]?.primaryFile?.metadata?.contextLength ?? null;
	}, [modelByPath, server]);

	const model = modelByPath[server.modelPath];
	// const draftModel = server.params.specDecode?.draftModelPath ? modelByPath[server.params.specDecode.draftModelPath] : null;
	const deviceName = useMemo(getDeviceName, [getDeviceName]);
	// const modelMaxCtx = useMemo(getModelMaxContext, [getModelMaxContext]);
	// const configuredCtx = server.params.contextSize;
	// const displayCtx = useMemo(() => configuredCtx === 0 ? (modelMaxCtx ? formatCount(modelMaxCtx) : 'auto') : formatCount(configuredCtx), [configuredCtx, modelMaxCtx]);
	// const backendName = useMemo(() => group?.name ? `${group.name} (${backend?.name ?? 'Unknown'})` : backend?.name ?? "Backend Not Found!", [group, backend]);
	const backendName = useMemo(() => group?.name ?? backend?.name ?? "Backend Not Found!", [group, backend]);

	return (
		<Card
			p="3"
			hasGradient={isRunning || isLoading}
			gradientFrom={isRunning ? "var(--wc-accent-green-bg-8)" : "var(--wc-accent-yellow-bg-8)"}
			gradientTo="transparent"
			borderColor={isRunning ? 'var(--wc-accent-green-border)' : isLoading ? 'var(--wc-accent-yellow-border)' : undefined}
		>
			<VStack align="stretch" gap="3">
				<Flex justify="space-between" align="start">
					<HStack gap="4" pr="3">
						<Flex
							w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
							position="relative"
							bg={isRunning ? 'var(--wc-bg-card)' : isLoading ? 'var(--wc-accent-yellow-bg-8)' : 'var(--wc-bg-card)'}
							borderWidth="1px"
							borderColor={isRunning ? 'var(--wc-accent-green-border)' : isLoading ? 'var(--wc-accent-yellow-border)' : 'var(--wc-border-subtle)'}
						>
							<Server size={18} color={isRunning ? 'var(--wc-accent-green)' : isLoading ? 'var(--wc-accent-yellow)' : 'var(--wc-text-muted)'} />
						</Flex>
						<Box>
							<HStack gap="3" alignItems="center" flexWrap="wrap">
								<HoverCard.Root size="sm" openDelay={150}>
									<HoverCard.Trigger asChild>
										<Text fontSize="13px" fontWeight="600" color="var(--wc-special-card-name)" cursor="help">{server.serverName}</Text>
									</HoverCard.Trigger>
									<Portal>
										<HoverCard.Positioner>
											<HoverCard.Content
												bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)"
												borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="3"
												maxW="500px"
											>
												<VStack align="stretch" gap="2">
													<Box
														fontSize="10px" fontFamily='"Geist Mono", monospace' color="var(--wc-text-secondary)"
														bg="var(--wc-bg-subtle)" borderRadius="md" p="2.5"
														whiteSpace="pre-wrap" wordBreak="break-word" lineHeight="1.8"
													>
														{formatLaunchCommand(server.launchCommand ?? '')}
													</Box>
												</VStack>
											</HoverCard.Content>
										</HoverCard.Positioner>
									</Portal>
								</HoverCard.Root>
								{server.serverAlias && server.serverAlias.length > 0 && (
									<>
										{server.serverAlias.map(alias => (
											<Badge key={alias} px="1.5" py="0.5" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-special-indigo-bg)" color="var(--wc-special-indigo)" borderWidth="1px" borderColor="var(--wc-special-indigo-border)">
												{alias}
												<Button
													size="xs"
													variant="ghost"
													p="0"
													minW="auto"
													h="14px"
													w="14px"
													ml="1"
color="var(--wc-special-indigo)"
					_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
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
										<Badge px="1.5" py="0.5" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-special-indigo-bg-subtle)" color="var(--wc-special-indigo)" borderWidth="1px" borderColor="var(--wc-special-indigo-border-subtle)" cursor="pointer" onClick={(e) => { e.stopPropagation(); setAddingAliasOpen(true); }}  title="Add Alias">
											<Plus size={10} />
										</Badge>
									</Popover.Trigger>
									<Portal>
										<Popover.Positioner>
											<Popover.Content maxW="320px" bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)">
												<Popover.Arrow />
												<Popover.Body p="4">
													<Text fontSize="12px" fontWeight="medium" color="var(--wc-text-primary)" mb="3">Add alias for "{server.serverName}"</Text>
													<HStack gap="2">
														<Input
															value={newAliasValue}
															onChange={(e) => setNewAliasValue(e.target.value)}
															onKeyDown={(e) => { if (e.key === 'Enter') handleAddAlias(); }}
															placeholder="Enter comma separated aliases..."
															size="sm"
bg="var(--wc-bg-subtle)"
															borderColor="var(--wc-border-overlay)"
															color="var(--wc-text-primary)"
															_placeholder={{ color: 'var(--wc-text-faint)' }}
														/>
														<Button
															size="sm"
															bgGradient="to-r"
															gradientFrom="var(--wc-gradient-blue-from)"
															gradientTo="var(--wc-gradient-blue-to)"
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
								{isRunning || isLoading && <StatusBadge status={server.status as EServerStatus} port={server.port} />}
								{isRunning && (
									<HStack gap="1" color="var(--wc-text-muted)">
										<Clock size={11} />
										<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
									</HStack>
								)}
								<ServerSlots serverId={serverId} />
							</HStack>
							<HStack gap="4" flexWrap="wrap" mt="2.5">
								<HStack gap="1">
									<StatPill icon={<FaBrain size={13} />} label="Model" value={model?.name ?? "Model Not Found!"} />
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="var(--wc-special-vision-yellow)" boxSize="14px" ml="1" mr="1"><FaRegEye title="Vision"/></Icon>
									)}
									{model?.mmprojFile && !server.useMultiModal && (
										<Icon color="var(--wc-special-vision-red)" boxSize="14px" ml="1" mr="1"><GoEyeClosed  title="Multi-modal disabled"/></Icon>
									)}
									{model?.mmprojFile && server.useMultiModal && (
										<Icon color="var(--wc-special-vision-red)" boxSize="14px" ml="1" mr="1"><LuSaveOff title="Cannot save checkpoints when multi-modal is enabled" /></Icon>
									)}
									{/* {model?.primaryFile?.metadata?.quantType ? (
										<Badge
											px="1.5" py="0.25" borderRadius="md" fontSize="10px"
											fontFamily='"Geist Mono", monospace'
											bg={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 15%, transparent)`}
											color={QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.5)'}
											borderWidth="1px"
											borderColor={`color-mix(in srgb, ${QUANT_COLORS[model.primaryFile.metadata.quantType] ?? 'rgba(255, 255, 255, 0.3)'} 30%, transparent)`}
										>
											{model?.name ?? "Model Not Found!"}
										</Badge>
									) : (
										<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? "Model Not Found!"} />
									)} */}
								</HStack>
								{server.params.specDecode?.enabled && (
									server.params.specDecode.mode === 'mtp' && (
										<StatPill icon={<Sparkles size={13} />} label="Spec" value="MTP" />
									) ||
									server.params.specDecode.mode === 'ngram' && (
										<StatPill icon={<Sparkles size={13} />} label="Spec" value="Ngram" />
									) ||
									server.params.specDecode.mode === 'draft' && (
										<StatPill icon={<Sparkles size={13} />} label="Spec" value={"Draft"} />
									)
								)}
								<StatPill icon={<Blocks size={13} />} label={backend?.name || "Backend"} value={backendName} />
								<StatPill icon={<BsGpuCard size={13} />} label="Device" value={deviceName} />
								{/* <StatPill icon={<FaBookOpen size={12} />} label="Context" value={`${displayCtx}`} /> */}
							</HStack>
							{server.error && (
								<Text fontSize="11px" color="var(--wc-accent-red)" lineClamp={1} mt="0.5">{server.error}</Text>
							)}
						</Box>
					</HStack>

					<HStack gap="1" my="auto" pl="3">
						{showCheckpointButtons && <Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="md" onClick={() => onLoadCheckpoint(serverId)} title="Load KV Checkpoint">
							<Zap size={14} />
						</Button>}
						{isRunning && showCheckpointButtons && (
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="md" onClick={() => onSaveCheckpoint(serverId)} title="Save KV Checkpoint">
								<Save size={14} />
							</Button>
						)}
						<Box w="1px" h="16px" bg="var(--wc-border-subtle)" my="auto" />
						{!isRunning && !isLoading && (
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-yellow)', bg: 'var(--wc-accent-yellow-bg-8)' }} borderRadius="md" onClick={handleRestart} title="Launch Server">
								<Play size={14} />
							</Button>
						)}
						{(isRunning || isLoading) && (
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-yellow)', bg: 'var(--wc-accent-yellow-bg-8)' }} borderRadius="md" onClick={handleRestart} title="Restart Server">
								<RotateCcw size={14} />
							</Button>
						)}
						<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-special-cyan)', bg: 'var(--wc-special-cyan-bg)' }} borderRadius="md" onClick={() => onShowLogs(serverId)} title="Server logs">
							<Terminal size={14} />
						</Button>
						<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="md" onClick={() => onEdit(serverId)} title="Edit Server">
							<Edit size={14} />
						</Button>
						<Box w="1px" h="16px" bg="var(--wc-border-subtle)" my="auto" />
						{(isRunning || isLoading) ? (
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={handleStop}  title="Stop Server">
								<Square size={14} />
							</Button>
						) : (
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={() => onConfirmDelete(serverId)} title="Delete Server">
								<Trash2 size={14} />
							</Button>
						)}
					</HStack>
				</Flex>
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
