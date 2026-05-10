import React, { useState, useCallback, useMemo } from 'react';
import { Box, Text, HStack, VStack, Flex, Button, Badge, Input, Portal, Popover, HoverCard } from '@chakra-ui/react';
import { Play, Square, RotateCcw, Mic, Clock, Trash2, X, Plus, Terminal, Edit, Blocks } from 'lucide-react';
import { FaBrain, FaBookOpen } from 'react-icons/fa6';
import { Card } from '@/components/Card';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useMutation } from '@/hooks/useQuery';
import { useStore } from '@/store';
import { stopWhisperServer, restartWhisperServer, updateWhisperServer } from '@/api/whisperServices';
import type { IWhisperServer, IWhisperModel } from '@warpcore/shared';
import { EWhisperServerStatus } from '@warpcore/shared';
import { formatUptime, StatPill } from './utils';

interface IWhisperServerCardProps {
	serverId: string;
	modelByPath: Record<string, IWhisperModel>;
	onShowLogs: (serverId: string) => void;
	onEdit: (serverId: string) => void;
	onConfirmDelete: (serverId: string) => void;
}

export const WhisperServerCard = React.memo(({
	serverId,
	modelByPath,
	onShowLogs,
	onEdit,
	onConfirmDelete,
}: IWhisperServerCardProps) => {
	const server = useStore((s) => s.whisperServers[serverId]);
	const whisperBackends = useStore((s) => s.whisperBackends);

	const isRunning = server?.status === EWhisperServerStatus.RUNNING;
	const isLoading = server?.status === EWhisperServerStatus.LOADING;

	const backend = server?.backendId ? whisperBackends[server.backendId] : null;
	const model = server ? modelByPath[server.modelPath] : null;

	const { mutate: stopMut } = useMutation<string, IWhisperServer>(useCallback((id: string) => stopWhisperServer(id), []));
	const { mutate: restartMut } = useMutation<string, IWhisperServer>(useCallback((id: string) => restartWhisperServer(id), []));

	const handleStop = useCallback(() => { stopMut(serverId); }, [stopMut, serverId]);
	const handleRestart = useCallback(() => { restartMut(serverId); }, [restartMut, serverId]);

	// Alias management
	const [removingAlias, setRemovingAlias] = useState<string | null>(null);
	const [addingAliasOpen, setAddingAliasOpen] = useState(false);
	const [newAliasValue, setNewAliasValue] = useState('');

	const updateCallback = useCallback(([id, data]: Array<any>) => updateWhisperServer(id, data), []);
	const { mutate: updateMut, loading } = useMutation<[string, Partial<Pick<IWhisperServer, 'serverAlias'>>], IWhisperServer>(updateCallback);

	const handleRemoveAlias = useCallback(async () => {
		if (!removingAlias) return;
		const newAliases = (server?.serverAlias ?? []).filter(a => a !== removingAlias);
		await updateMut([serverId, { serverAlias: newAliases }]);
		setRemovingAlias(null);
	}, [removingAlias, server, updateMut, serverId]);

	const handleAddAlias = useCallback(async () => {
		if (!newAliasValue.trim()) return;
		const existingAliases = server?.serverAlias ?? [];
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

	if (!server) return null;

	const backendName = backend?.name ?? 'Backend Not Found!';
	const modelMeta = model?.primaryFile?.metadata ?? null;

	return (
		<Card
			p="3"
			hasGradient={isRunning || isLoading}
			gradientFrom={isRunning ? 'var(--wc-accent-green-bg-8)' : 'var(--wc-accent-yellow-bg-8)'}
			gradientTo="transparent"
			borderColor={isRunning ? 'var(--wc-accent-green-border)' : isLoading ? 'var(--wc-accent-yellow-border)' : undefined}
		>
			<VStack align="stretch" gap="2.5">
				<Flex justify="space-between" align="start">
					<HStack gap="3" pr="3">
						<Flex
							w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
							bg={isRunning ? 'var(--wc-bg-card)' : isLoading ? 'var(--wc-accent-yellow-bg-8)' : 'var(--wc-bg-card)'}
							borderWidth="1px"
							borderColor={isRunning ? 'var(--wc-accent-green-border)' : isLoading ? 'var(--wc-accent-yellow-border)' : 'var(--wc-border-subtle)'}
						>
							<Mic size={18} color={isRunning ? 'var(--wc-accent-green)' : isLoading ? 'var(--wc-accent-yellow)' : 'var(--wc-text-muted)'} />
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
														whiteSpace="pre-wrap" wordBreak="break-all" lineHeight="1.4"
													>
														{server.launchCommand}
													</Box>
												</VStack>
											</HoverCard.Content>
										</HoverCard.Positioner>
									</Portal>
								</HoverCard.Root>
								<Badge
									px="1.5" py="0.5" borderRadius="md" fontSize="10px" fontWeight="600"
									bg={isRunning ? 'var(--wc-accent-green-bg-15)' : isLoading ? 'var(--wc-accent-yellow-bg-15)' : 'var(--wc-bg-hover)'}
									color={isRunning ? 'var(--wc-accent-green)' : isLoading ? 'var(--wc-accent-yellow)' : 'var(--wc-text-muted)'}
								>
									{server.status}{server.port > 0 ? ` :${server.port}` : ''}
								</Badge>
								{server.serverAlias && server.serverAlias.length > 0 && (
									<>
										{server.serverAlias.map(alias => (
											<Badge key={alias} px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-special-indigo-bg)" color="var(--wc-special-indigo)" borderWidth="1px" borderColor="var(--wc-special-indigo-border)">
												{alias}
												<Button
													size="xs" variant="ghost" p="0" minW="auto" h="14px" w="14px" ml="2"
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
										<Badge px="1.5" py="0.25" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-special-indigo-bg-subtle)" color="var(--wc-special-indigo)" borderWidth="1px" borderColor="var(--wc-special-indigo-border-subtle)" cursor="pointer" onClick={(e) => { e.stopPropagation(); setAddingAliasOpen(true); }} title="Add Alias">
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
															gradientFrom="var(--wc-gradient-green-from)"
															gradientTo="var(--wc-gradient-green-to)"
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
								{isRunning && server.startedAt && (
									<HStack gap="1" color="var(--wc-text-muted)">
										<Clock size={11} />
										<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
									</HStack>
								)}
							</HStack>
							<HStack gap="2.5" flexWrap="wrap" mt="1.5">
								<HStack gap="1">
									<StatPill icon={<FaBrain size={12} />} label="Model" value={model?.name ?? modelMeta?.modelSize ?? 'Unknown'} />
									{modelMeta?.ftype && (
										<Badge
											px="1.5" py="0.25" borderRadius="md" fontSize="10px"
											fontFamily='"Geist Mono", monospace'
											bg="color-mix(in srgb, var(--wc-accent-green) 15%, transparent)"
											color="var(--wc-accent-green)"
											borderWidth="1px"
											borderColor="color-mix(in srgb, var(--wc-accent-green) 30%, transparent)"
										>
											{modelMeta.ftype}
										</Badge>
									)}
								</HStack>
								<StatPill icon={<Blocks size={12} />} label="Backend" value={backendName} />
							</HStack>
							{server.error && (
								<Text fontSize="11px" color="var(--wc-accent-red)" lineClamp={1} mt="0.5">{server.error}</Text>
							)}
						</Box>
					</HStack>

					<HStack gap="1" my="auto" pl="3">
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
							<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={handleStop} title="Stop Server">
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
