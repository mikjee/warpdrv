import { Box, Text, HStack, VStack, Flex, Button, Spinner } from '@chakra-ui/react';
import {
	Play, Square, RotateCcw, Plus, Server, Clock, Zap, Trash2,
	Activity, Gauge, MemoryStick, Terminal, Edit,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { VramBar } from '../components/VramBar';
import { LaunchServerDialog } from '../components/dialogs/LaunchServerDialog';
import { ServerLogs } from '../components/dialogs/ServerLogs';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { fetchServers, stopServer, restartServer, removeServer } from '../api/services';
import type { IServer } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

function formatUptime(startedAt: number | null): string {
	if (!startedAt) return '-';
	const ms = Date.now() - startedAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h ${mins % 60}m`;
}

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="2.5" py="1.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)">
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)">{label}</Text>
			<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}

export function ServersPage() {
	const fetcher = useCallback(() => fetchServers(), []);
	const { data: servers, loading, refetch } = useListQuery<IServer>(fetcher, { pollInterval: 3000 });

	const [showLaunch, setShowLaunch] = useState(false);
	const [logsServerId, setLogsServerId] = useState<string | null>(null);
	const [editingServerId, setEditingServerId] = useState<string | null>(null);
	const [deletingServerId, setDeletingServerId] = useState<string | null>(null);
	const logsServer = servers.find(s => s.id === logsServerId);
	const editingServer = servers.find(s => s.id === editingServerId);
	const deletingServer = servers.find(s => s.id === deletingServerId);

	const stopMut = useMutation<string, IServer>(useCallback((id: string) => stopServer(id), []));
	const restartMut = useMutation<string, IServer>(useCallback((id: string) => restartServer(id), []));
	const removeMut = useMutation<string, null>(useCallback((id: string) => removeServer(id), []));

	const handleStop = async (id: string) => { await stopMut.mutate(id); await refetch(); };
	const handleRestart = async (id: string) => { await restartMut.mutate(id); await refetch(); };
	const handleRemove = async (id: string) => { await removeMut.mutate(id); await refetch(); setDeletingServerId(null); };
	const confirmDelete = (id: string) => { setDeletingServerId(id); };

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${servers.filter(s => s.status === EServerStatus.RUNNING).length} running`}
				icon={<Play size={20} />}
				actions={
					<Button
						size="sm"
						bgGradient="to-r"
						gradientFrom="#3381ff"
						gradientTo="#5b6af5"
						color="white"
						_hover={{ opacity: 0.9, transform: 'translateY(-1px)', shadow: '0 4px 20px rgba(51, 129, 255, 0.3)' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="600"
						transition="all 0.2s ease"
						onClick={() => setShowLaunch(true)}
					>
						<Plus size={15} />
						Launch Server
					</Button>
				}
			/>
			<Box p="8">
				{loading && servers.length === 0 ? (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
					</Flex>
				) : servers.length === 0 ? (
					<Flex
						h="300px" alignItems="center" justifyContent="center"
						borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" borderRadius="xl" borderStyle="dashed"
					>
						<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
							<Server size={40} />
							<Text fontSize="14px">No servers running</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.15)">Click "Launch Server" to get started</Text>
						</VStack>
					</Flex>
				) : (
					<VStack align="stretch" gap="4">
						{servers.map(server => {
							const isRunning = server.status === EServerStatus.RUNNING;
							const isLoading = server.status === EServerStatus.LOADING;

							return (
								<Card key={server.id}>
									<VStack align="stretch" gap="4">
										<Flex justify="space-between" align="start">
											<HStack gap="3">
												<Flex
													w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
													position="relative"
													bg={isRunning ? 'rgba(52, 211, 153, 0.06)' : 'rgba(255, 255, 255, 0.04)'}
													borderWidth="1px"
													borderColor={isRunning ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
												>
													<Server size={18} color={isRunning ? '#34d399' : 'rgba(255, 255, 255, 0.3)'} />
													{isRunning && <Box position="absolute" top="-1px" right="-1px" w="8px" h="8px" borderRadius="full" bg="#34d399" shadow="0 0 8px #34d399" />}
												</Flex>
												<Box>
													<HStack gap="2">
														<Text fontSize="15px" fontWeight="600" color="#e4e4e7">{server.modelAlias}</Text>
														<StatusBadge status={server.status as EServerStatus} />
													</HStack>
													<HStack gap="3" mt="0.5">
														<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace'>:{server.port}</Text>
														<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">|</Text>
														<HStack gap="1" color="rgba(255, 255, 255, 0.35)">
															<Clock size={11} />
															<Text fontSize="12px">{formatUptime(server.startedAt)}</Text>
														</HStack>
														{server.error && (
															<>
																<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">|</Text>
																<Text fontSize="11px" color="#fb7185" lineClamp={1}>{server.error}</Text>
															</>
														)}
													</HStack>
												</Box>
											</HStack>

											<HStack gap="1.5">
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="md" onClick={() => setEditingServerId(server.id)}>
													<Edit size={14} />
												</Button>
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.08)' }} borderRadius="md" onClick={() => setLogsServerId(server.id)}>
													<Terminal size={14} />
												</Button>
												{!isRunning && !isLoading && (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={() => handleRestart(server.id)}>
														<Play size={14} />
													</Button>
												)}
												{(isRunning || isLoading) && (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="md" onClick={() => handleRestart(server.id)}>
														<RotateCcw size={14} />
													</Button>
												)}
												{(isRunning || isLoading) ? (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => handleStop(server.id)}>
														<Square size={14} />
													</Button>
												) : (
													<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={() => confirmDelete(server.id)}>
														<Trash2 size={14} />
													</Button>
												)}
											</HStack>
										</Flex>

										{/* Stats */}
										{server.stats && !server.stats.isLoading && server.stats.tokensGenerated != null && (
											<>
												<HStack gap="2" flexWrap="wrap">
													<StatPill icon={<Gauge size={12} />} label="Prompt" value={`${(server.stats.promptSpeed ?? 0).toFixed(0)} t/s`} />
													<StatPill icon={<Zap size={12} />} label="Gen" value={`${(server.stats.genSpeed ?? 0).toFixed(1)} t/s`} />
													<StatPill icon={<Activity size={12} />} label="Slots" value={`${server.stats.slotsProcessing ?? 0}/${(server.stats.slotsProcessing ?? 0) + (server.stats.slotsIdle ?? 0)}`} />
													<StatPill icon={<MemoryStick size={12} />} label="Tokens" value={(server.stats.tokensGenerated ?? 0).toLocaleString()} />
												</HStack>
												{(server.stats.slots ?? []).length > 0 && (
													<VStack align="stretch" gap="1.5" mt="1">
														{(server.stats.slots ?? []).map(slot => (
															<HStack key={slot.id} gap="2" px="2.5" py="1.5" borderRadius="md" bg={slot.state === 'processing' ? 'rgba(51, 129, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)'} borderWidth="1px" borderColor={slot.state === 'processing' ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'}>
																<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace' w="50px">Slot {slot.id}</Text>
																<Box flex="1" h="3px" bg="rgba(255, 255, 255, 0.06)" borderRadius="full" overflow="hidden">
																	<Box h="100%" w={slot.contextTotal > 0 ? `${(slot.contextUsed / slot.contextTotal * 100)}%` : '0%'} bg="#3381ff" borderRadius="full" />
																</Box>
																<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>{slot.contextUsed}/{slot.contextTotal}</Text>
																<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" fontFamily='"Geist Mono", monospace'>{slot.genSpeed.toFixed(1)} t/s</Text>
															</HStack>
														))}
													</VStack>
												)}
											</>
										)}
									</VStack>
								</Card>
							);
						})}
					</VStack>
				)}
			</Box>

			{showLaunch && (
				<LaunchServerDialog onClose={() => { setShowLaunch(false); refetch(); }} />
			)}

			{logsServer && (
				<ServerLogs serverId={logsServer.id} serverAlias={logsServer.modelAlias} onClose={() => setLogsServerId(null)} />
			)}

			{editingServer && (
				<LaunchServerDialog
					onClose={() => setEditingServerId(null)}
					editMode={{
						serverId: editingServer.id,
						backendId: editingServer.backendId,
						modelPath: editingServer.modelPath,
						mmprojPath: editingServer.mmprojPath ?? null,
						params: editingServer.params,
					}}
				/>
			)}

			{deletingServer && (
				<ConfirmDialog
					title="Delete Server?"
					message={`This will remove "${deletingServer.modelAlias}" from your configuration. The server process will not be affected.`}
					isOpen={true}
					isLoading={removeMut.loading}
					onCancel={() => setDeletingServerId(null)}
					onConfirm={() => handleRemove(deletingServer.id)}
				/>
			)}
		</Box>
	);
}
