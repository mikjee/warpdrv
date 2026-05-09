import { Box, Text, HStack, VStack, Flex, Button, Input, Switch, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import {
	Server, Search, ChevronDown, ArrowUpAZ, ArrowDownZA, Play, ChevronRight,
} from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '@/hooks/useDependantState';
import { PageHeader } from '@/components/PageHeader';
import { useStore } from '@/store';
import { updateSettings, removeServer } from '@/api/services';
import { useMutation } from '@/hooks/useQuery';
import type { IServer, IBackend, IBackendGroup, IModel, TSortField, TSortOrder, IWhisperServer } from '@warpcore/shared';
import { EServerStatus, EWhisperServerStatus } from '@warpcore/shared';
import { removeWhisperServer, stopWhisperServer, restartWhisperServer } from '@/api/whisperServices';
import { ServerCard } from './ServerCard';
import { LaunchServerDialog } from './LaunchServer/LaunchServerDialog';
import { WhisperLaunchDialog } from './LaunchWhisper/WhisperLaunchDialog';
import { ServerLogs } from './ServerLogs';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SaveCheckpointDialog } from './Checkpoints/SaveCheckpointDialog';
import { LoadCheckpointDialog } from './Checkpoints/LoadCheckpointDialog';

const FIELD_LABELS: Record<TSortField, string> = {
	name: 'Name',
	recency: 'Recently Used',
	backend: 'Backend',
};

export const ServersPage = React.memo(() => {
	const servers = useStore((s) => s.servers);
	const serversArr = useMemo(() => Object.values(servers), [servers]);
	const whisperServers = useStore((s) => s.whisperServers);
	const whisperServersArr = useMemo(() => Object.values(whisperServers), [whisperServers]);
	const backends = useStore((s) => s.backends);
	const groups = useStore((s) => s.backendGroups);
	const models = useStore((s) => s.models);
	const settings = useStore(s => s.settings);

	// Filter and sort state
	const [searchQuery, setSearchQuery] = useState('');
	const [runningOnly, setRunningOnly] = useState(false);
	const [sortField, setSortField] = useDependantState(settings.serversSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.serversSortOrder);

	// Dialog state
	const [showLaunch, setShowLaunch] = useState(false);
	const [showWhisperLaunch, setShowWhisperLaunch] = useState(false);
	const [editingWhisperServerId, setEditingWhisperServerId] = useState<string | null>(null);
	const [deletingWhisperServerId, setDeletingWhisperServerId] = useState<string | null>(null);
	const [whisperExpanded, setWhisperExpanded] = useState(true);
	const [logsServerId, setLogsServerId] = useState<string | null>(null);
	const [editingServerId, setEditingServerId] = useState<string | null>(null);
	const [saveCheckpointServerId, setSaveCheckpointServerId] = useState<string | null>(null);
	const [loadCheckpointServerId, setLoadCheckpointServerId] = useState<string | null>(null);
	const [deletingServerId, setDeletingServerId] = useState<string | null>(null);

	const logsServer = logsServerId ? servers[logsServerId] : null;
	const deletingServer = deletingServerId ? servers[deletingServerId] : null;

	const onCloseServerLogs = useCallback(() => setLogsServerId(null), []);

	const handleSortChange = useCallback((field: TSortField, order: TSortOrder) => {
		setSortField(field);
		setSortOrder(order);
		updateSettings({ serversSortField: field, serversSortOrder: order });
	}, []);

	const modelByPath = useMemo(() => {
		const modelMap: Record<string, IModel> = {};
		Object.values(models).forEach(m => {
			if (m.primaryFile) modelMap[m.primaryFile.filePath] = m;
			m.files.forEach(f => {
				if (!m.primaryFile || f.filePath !== m.primaryFile.filePath) modelMap[f.filePath] = m;
			});
		});
		return modelMap;
	}, [models]);

	// Filter and sort servers
	const filteredServers = useMemo(() => {
		let result = [...serversArr];

		// Fuzzy search matching against multiple fields
		function matchesSearch(server: IServer, query: string): boolean {
			if (!query.trim()) return true;
			const q = query.toLowerCase();
			const backend = backends[server.backendId || ''];
			const group = groups[server.backendGroupId || ''];
			const model = modelByPath[server.modelPath];

			const searchableParts = [
				server.serverName,
				...(server.serverAlias ?? []),
				backend?.name ?? '',
				group?.name ?? '',
				model?.name ?? '',
				model?.primaryFile?.filePath ?? server.modelPath,
			];

			return searchableParts.some(part => part?.toLowerCase().includes(q));
		}

		if (searchQuery.trim()) {
			result = result.filter(s => matchesSearch(s, searchQuery));
		}

		if (runningOnly) {
			result = result.filter(s => s.status === EServerStatus.RUNNING);
		}

		result.sort((a, b) => {
			let comparison = 0;

			switch (sortField) {
				case 'name':
					comparison = a.serverName.localeCompare(b.serverName);
					break;
				case 'recency': {
					const aEffective = a.status === EServerStatus.LOADING ? Date.now() : (a.startedAt ?? 0);
					const bEffective = b.status === EServerStatus.LOADING ? Date.now() : (b.startedAt ?? 0);
					comparison = bEffective - aEffective;
					break;
				}
				case 'backend': {
					const backendA = a.backendGroupId ? groups[a.backendGroupId]?.name ?? 'Unknown' : backends[a.backendId!]?.name ?? 'Unknown';
					const backendB = b.backendGroupId ? groups[b.backendGroupId]?.name ?? 'Unknown' : backends[b.backendId!]?.name ?? 'Unknown';
					comparison = backendA.localeCompare(backendB);
					break;
				}
			}

			return sortOrder === 'asc' ? comparison : -comparison;
		});

		return result;
	}, [servers, searchQuery, sortField, sortOrder, runningOnly, backends, groups, modelByPath ]);

	const removeCallback = useCallback((id: string) => removeServer(id), []);

	// Mutations
	const { mutate: removeMut, loading } = useMutation<string, null>(removeCallback);
	const handleRemove = useCallback(async (id: string) => { await removeMut(id); setDeletingServerId(null); }, [
		removeMut
	]);

	const handleDeleteWhisper = useCallback(async (id: string) => {
		await removeWhisperServer(id);
		setDeletingWhisperServerId(null);
	}, []);

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${serversArr.filter(s => s.status === EServerStatus.RUNNING).length}/${serversArr.length} LLM, ${whisperServersArr.filter(s => s.status === EWhisperServerStatus.RUNNING).length}/${whisperServersArr.length} Whisper Running`}
				icon={<Server size={20} />}
				actions={
					<HStack gap="3">
						<InputGroup startElement={<Search size={14} color="var(--wc-text-tertiary)" />} w="200px">
							<Input
								placeholder="Search servers..."
								size="sm"
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'var(--wc-text-placeholder)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
								value={searchQuery}
								onChange={e => setSearchQuery(e.target.value)}
							/>
						</InputGroup>
						<HStack gap="3">
							{(() => {
								const sortCollection = createListCollection({
									items: (Object.keys(FIELD_LABELS) as TSortField[]).map(f => ({ value: f, label: FIELD_LABELS[f] })),
									itemToString: (item) => item.label,
								});
								return (
									<Combobox.Root
										collection={sortCollection}
										value={[sortField]}
										onValueChange={(details) => {
											const val = details.value?.[0] as TSortField;
											if (val) handleSortChange(val, sortOrder);
										}}
									>
										<Combobox.Control>
											<Combobox.Trigger asChild>
												<Button
													variant="outline"
													size="sm"
													w="150px"
													justifyContent="space-between"
													bg="var(--wc-bg-subtle)"
													borderColor="var(--wc-border-default)"
													color="var(--wc-text-secondary)"
													fontSize="13px"
													borderRadius="lg"
												>
													{FIELD_LABELS[sortField]}
													<ChevronDown size={14} />
												</Button>
											</Combobox.Trigger>
										</Combobox.Control>
										<Portal>
											<Combobox.Positioner>
												<Combobox.Content
													maxH="200px" overflowY="auto"
													bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'var(--wc-bg-hover)' }}
															_highlighted={{ bg: 'var(--wc-bg-elevated)' }}
														>
															<Text fontSize="12px" color="var(--wc-text-secondary)">{item.label}</Text>
															<Combobox.ItemIndicator />
														</Combobox.Item>
													))}
												</Combobox.Content>
											</Combobox.Positioner>
										</Portal>
									</Combobox.Root>
								);
							})()}
							<Button
								size="sm"
								variant="outline"
								bg="var(--wc-bg-subtle)"
								borderColor="var(--wc-border-default)"
								color="var(--wc-text-secondary)"
								borderRadius="md"
								_hover={{ borderColor: 'var(--wc-border-hover)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
						<Switch.Root label="Show only running servers" checked={runningOnly} onCheckedChange={(details) => setRunningOnly(details.checked)} color={runningOnly ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: runningOnly ? 'var(--wc-accent-blue)' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={runningOnly ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} userSelect="none">
								Running only
							</Switch.Label>
						</Switch.Root>
					</HStack>
				}
				actionsRight={
					<Button
						size="sm"
						bg="var(--wc-accent-blue-bg-12)"
						color="var(--wc-accent-blue)"
						borderWidth="1px" borderColor="var(--wc-accent-blue-border)"
						_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="600"
						transition="all 0.2s ease"
						onClick={() => setShowLaunch(true)}
						display={"flex"}
						flexDirection={"row"}
						alignItems={"center"}
						justifyContent={"center"}
					>
						<Play size={15} />
						Launch Server
					</Button>
				}
			/>

			<Box pt="76px" px="4" pb="4">
				{filteredServers.length === 0 ? (
					<Flex
						h="300px" alignItems="center" justifyContent="center"
						borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" borderStyle="dashed"
					>
						<VStack gap="3" color="var(--wc-text-muted)">
							<Server size={40} />
							<Text fontSize="14px">{serversArr.length === 0 ? 'No servers running' : 'No matching servers'}</Text>
							<Text fontSize="12px" color="var(--wc-text-disabled)">{serversArr.length === 0 ? 'Click "Launch Server" to get started' : 'Try adjusting your filters or search query'}</Text>
						</VStack>
					</Flex>
				) : (
					<VStack align="stretch" gap="4">
						{filteredServers.map(server => (
							<ServerCard
								key={server.id}
								serverId={server.id}
								modelByPath={modelByPath}
								onShowLogs={setLogsServerId}
								onEdit={setEditingServerId}
								onSaveCheckpoint={setSaveCheckpointServerId}
								onLoadCheckpoint={setLoadCheckpointServerId}
								onConfirmDelete={setDeletingServerId}
							/>
						))}
					</VStack>
				)}

				{/* Whisper Servers Section */}
				<Box mt="4" borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-surface)" overflow="hidden">
					<Flex px="4" py="3" mb="3" align="center" justify="space-between" cursor="pointer" onClick={() => setWhisperExpanded(!whisperExpanded)}>
						<HStack gap="3">
							<Box color="var(--wc-text-muted)">{whisperExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</Box>
							<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">Whisper Servers</Text>
							<Box px="1.5" py="0.5" borderRadius="full" bg="var(--wc-bg-hover)" color="var(--wc-text-muted)" fontSize="10px" fontWeight="600">{whisperServersArr.length}</Box>
						</HStack>
						<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ bg: 'var(--wc-accent-green-bg-15)', color: 'var(--wc-accent-green)' }}
							onClick={(e) => { e.stopPropagation(); setShowWhisperLaunch(true); }}>
							<Play size={14} />
							Launch Whisper
						</Button>
					</Flex>
					{whisperExpanded && (
						<Box px="4" pb="3">
							{whisperServersArr.length === 0 ? (
								<Flex py="8" alignItems="center" justifyContent="center">
									<VStack gap="2" color="var(--wc-text-faint)">
										<Text fontSize="13px">No whisper servers</Text>
										<Text fontSize="11px">Launch a whisper-server for speech-to-text</Text>
									</VStack>
								</Flex>
							) : (
								<VStack align="stretch" gap="2">
									{whisperServersArr.map(server => (
										<Box key={server.id} px="3" py="2" borderRadius="lg" bg="var(--wc-bg-card)" borderWidth="1px" borderColor="var(--wc-border-subtle)">
											<HStack justify="space-between">
												<VStack align="start" gap="1" flex="1" minW="0">
													<HStack gap="2">
														<Box w="8px" h="8px" borderRadius="full" bg={server.status === EWhisperServerStatus.RUNNING ? 'var(--wc-accent-green-icon)' : server.status === EWhisperServerStatus.LOADING ? 'var(--wc-accent-yellow-strong)' : server.status === EWhisperServerStatus.ERROR ? 'var(--wc-accent-red)' : 'var(--wc-text-disabled)'} />
														<Text fontSize="13px" fontWeight="500" color="var(--wc-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{server.serverName}</Text>
														{server.serverAlias?.length > 0 && server.serverAlias.map(a => (
															<Box key={a} px="1.5" py="0.5" borderRadius="md" bg="var(--wc-bg-hover)" fontSize="10px" color="var(--wc-text-muted)">{a}</Box>
														))}
													</HStack>
													<Text fontSize="11px" color="var(--wc-text-muted)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{server.modelPath}</Text>
												</VStack>
												<HStack gap="1">
													{server.status === EWhisperServerStatus.RUNNING && (
														<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)' }}
															onClick={() => stopWhisperServer(server.id)}>
															Stop
														</Button>
													)}
													{(server.status === EWhisperServerStatus.RUNNING || server.status === EWhisperServerStatus.LOADING) && (
														<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)' }}
															onClick={() => restartWhisperServer(server.id)}>
															Restart
														</Button>
													)}
													<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-text-primary)' }}
														onClick={() => setEditingWhisperServerId(server.id)}>
														Edit
													</Button>
													<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)' }}
														onClick={() => setDeletingWhisperServerId(server.id)}>
														Delete
													</Button>
												</HStack>
											</HStack>
										</Box>
									))}
								</VStack>
							)}
						</Box>
					)}
				</Box>
			</Box>

			{showLaunch && (
				<LaunchServerDialog onClose={() => setShowLaunch(false)} />
			)}

			{logsServer && (
				<ServerLogs serverId={logsServer.id} serverName={logsServer.serverName} onClose={onCloseServerLogs} />
			)}

			{editingServerId && (
				<LaunchServerDialog
					onClose={() => setEditingServerId(null)}
					serverId={editingServerId ?? undefined}
				/>
			)}
			{saveCheckpointServerId && servers[saveCheckpointServerId] && (
				<SaveCheckpointDialog
					server={servers[saveCheckpointServerId]!}
					isOpen={true}
					onClose={() => setSaveCheckpointServerId(null)}
				/>
			)}
			{loadCheckpointServerId && servers[loadCheckpointServerId] && (
				<LoadCheckpointDialog
					server={servers[loadCheckpointServerId]!}
					isOpen={true}
					onClose={() => setLoadCheckpointServerId(null)}
				/>
			)}

			{deletingServer && (
				<ConfirmDialog
					title="Delete Server?"
					message={`This will remove "${deletingServer.serverName}" from your configuration. The server process will not be affected.`}
					isOpen={true}
					isLoading={loading}
					onCancel={() => setDeletingServerId(null)}
					onConfirm={() => handleRemove(deletingServer.id)}
				/>
			)}

			{showWhisperLaunch && (
				<WhisperLaunchDialog onClose={() => setShowWhisperLaunch(false)} />
			)}

			{editingWhisperServerId && (
				<WhisperLaunchDialog
					onClose={() => setEditingWhisperServerId(null)}
					serverId={editingWhisperServerId}
				/>
			)}

			{deletingWhisperServerId && whisperServers[deletingWhisperServerId] && (
				<ConfirmDialog
					title="Delete Whisper Server?"
					message={`This will remove "${whisperServers[deletingWhisperServerId]!.serverName}" from your configuration.`}
					isOpen={true}
					isLoading={false}
					onCancel={() => setDeletingWhisperServerId(null)}
					onConfirm={() => handleDeleteWhisper(deletingWhisperServerId)}
				/>
			)}
		</Box>
	);
});
