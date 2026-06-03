import { Box, Text, HStack, VStack, Flex, Button, Input, Switch, InputGroup, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import {
	Server, Search, ChevronDown, ArrowUpAZ, ArrowDownZA, Play,
} from 'lucide-react';
import React, { useState, useCallback, useMemo } from 'react';
import { useDependantState } from '@/hooks/useDependantState';
import { PageHeader } from '@/components/PageHeader';
import { useStore } from '@/store';
import { updateSettings, removeServer } from '@/api/services';
import { useMutation } from '@/hooks/useQuery';
import type { IServer, IBackend, IBackendGroup, IModel, TSortField, TSortOrder, IWhisperServer, IWhisperBackend } from '@warpcore/shared';
import { EServerStatus, EWhisperServerStatus } from '@warpcore/shared';
import { removeWhisperServer, stopWhisperServer, restartWhisperServer } from '@/api/whisperServices';
import { ServerCard } from './ServerCard';
import { WhisperServerCard } from './WhisperServerCard';
import { LaunchServerDialog } from './LaunchServer/LaunchServerDialog';
import { WhisperLaunchDialog } from './LaunchWhisper/WhisperLaunchDialog';
import { ServerLogs } from './ServerLogs';
import { WhisperServerLogs } from './WhisperServerLogs';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { SaveCheckpointDialog } from './Checkpoints/SaveCheckpointDialog';
import { LoadCheckpointDialog } from './Checkpoints/LoadCheckpointDialog';

const FIELD_LABELS: Record<TSortField, string> = {
	name: 'Name',
	recency: 'Recently Used',
	backend: 'Backend',
};

type UnifiedServerEntry =
	| { __type: 'llama'; server: IServer }
	| { __type: 'whisper'; server: IWhisperServer };

function isServerRunning(server: { status: EServerStatus | EWhisperServerStatus }): boolean {
	return server.status === EServerStatus.RUNNING || server.status === EWhisperServerStatus.RUNNING;
}

function getEffectiveStartTime(server: { status: EServerStatus | EWhisperServerStatus; startedAt: number | null }): number {
	const isLoading = server.status === EServerStatus.LOADING || server.status === EWhisperServerStatus.LOADING;
	return isLoading ? Date.now() : (server.startedAt ?? 0);
}

function getBackendName(entry: UnifiedServerEntry, backends: Record<string, IBackend>, groups: Record<string, IBackendGroup>, whisperBackends: Record<string, IWhisperBackend>): string {
	if (entry.__type === 'llama') {
		const s = entry.server;
		return s.backendGroupId ? groups[s.backendGroupId]?.name ?? 'Unknown' : backends[s.backendId!]?.name ?? 'Unknown';
	} else {
		return whisperBackends[entry.server.backendId ?? '']?.name ?? 'Unknown';
	}
}

export const ServersPage = React.memo(() => {
	const servers = useStore((s) => s.servers);
	const serversArr = useMemo(() => Object.values(servers), [servers]);
	const whisperServers = useStore((s) => s.whisperServers);
	const whisperServersArr = useMemo(() => Object.values(whisperServers), [whisperServers]);
	const whisperModels = useStore((s) => s.whisperModels);
	const whisperBackends = useStore((s) => s.whisperBackends);
	const backends = useStore((s) => s.backends);
	const groups = useStore((s) => s.backendGroups);
	const models = useStore((s) => s.models);
	const settings = useStore(s => s.settings);

	const [searchQuery, setSearchQuery] = useState('');
	const [runningOnly, setRunningOnly] = useState(false);
	const [sortField, setSortField] = useDependantState(settings.serversSortField);
	const [sortOrder, setSortOrder] = useDependantState(settings.serversSortOrder);

	// Dialog state
	const [showLaunch, setShowLaunch] = useState(false);
	const [showWhisperLaunch, setShowWhisperLaunch] = useState(false);
	const [editingWhisperServerId, setEditingWhisperServerId] = useState<string | null>(null);
	const [deletingWhisperServerId, setDeletingWhisperServerId] = useState<string | null>(null);
	const [logsServerId, setLogsServerId] = useState<string | null>(null);
	const [logsWhisperServerId, setLogsWhisperServerId] = useState<string | null>(null);
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

	const whisperModelByPath = useMemo(() => {
		const modelMap: Record<string, any> = {};
		Object.values(whisperModels || {}).forEach(m => {
			if (m.primaryFile) modelMap[m.primaryFile.filePath] = m;
			m.files.forEach(f => {
				if (!m.primaryFile || f.filePath !== m.primaryFile.filePath) modelMap[f.filePath] = m;
			});
		});
		return modelMap;
	}, [whisperModels]);

	function matchesSearch(entry: UnifiedServerEntry, query: string): boolean {
		if (!query.trim()) return true;
		const q = query.toLowerCase();

		if (entry.__type === 'llama') {
			const s = entry.server;
			const backend = backends[s.backendId || ''];
			const group = groups[s.backendGroupId || ''];
			const model = modelByPath[s.modelPath];
			const searchableParts = [
				s.serverName,
				...(s.serverAlias ?? []),
				backend?.name ?? '',
				group?.name ?? '',
				model?.name ?? '',
				model?.primaryFile?.filePath ?? s.modelPath,
			];
			return searchableParts.some(part => part?.toLowerCase().includes(q));
		} else {
			const s = entry.server;
			const backend = whisperBackends[s.backendId ?? ''];
			const model = whisperModelByPath[s.modelPath];
			const searchableParts = [
				s.serverName,
				...(s.serverAlias ?? []),
				backend?.name ?? '',
				model?.name ?? '',
				s.modelPath,
			];
			return searchableParts.some(part => part?.toLowerCase().includes(q));
		}
	}

	function sortEntries(a: UnifiedServerEntry, b: UnifiedServerEntry): number {
		let comparison = 0;

		switch (sortField) {
			case 'name':
				comparison = a.server.serverName.localeCompare(b.server.serverName);
				break;
			case 'recency': {
				const aTime = getEffectiveStartTime(a.server);
				const bTime = getEffectiveStartTime(b.server);
				comparison = bTime - aTime;
				break;
			}
			case 'backend': {
				const backendA = getBackendName(a, backends, groups, whisperBackends);
				const backendB = getBackendName(b, backends, groups, whisperBackends);
				comparison = backendA.localeCompare(backendB);
				break;
			}
		}

		return sortOrder === 'asc' ? comparison : -comparison;
	}

	const unifiedServers = useMemo(() => {
		const llamaEntries: UnifiedServerEntry[] = serversArr
			.map(s => ({ __type: 'llama' as const, server: s }));
		const whisperEntries: UnifiedServerEntry[] = whisperServersArr
			.map(s => ({ __type: 'whisper' as const, server: s }));

		let result = [...llamaEntries, ...whisperEntries];

		if (searchQuery.trim()) {
			result = result.filter(e => matchesSearch(e, searchQuery));
		}

		if (runningOnly) {
			result = result.filter(e => isServerRunning(e.server));
		}

		result.sort(sortEntries);

		return result;
	}, [serversArr, whisperServersArr, searchQuery, sortField, sortOrder, runningOnly, backends, groups, whisperBackends, modelByPath, whisperModelByPath]);

	const removeCallback = useCallback((id: string) => removeServer(id), []);

	const { mutate: removeMut, loading } = useMutation<string, null>(removeCallback);
	const handleRemove = useCallback(async (id: string) => { await removeMut(id); setDeletingServerId(null); }, [
		removeMut
	]);

	const handleDeleteWhisper = useCallback(async (id: string) => {
		await removeWhisperServer(id);
		setDeletingWhisperServerId(null);
	}, []);

	const llamaRunningCount = serversArr.filter(s => s.status === EServerStatus.RUNNING).length;
	const whisperRunningCount = whisperServersArr.filter(s => s.status === EWhisperServerStatus.RUNNING).length;

	const showEmptyState = unifiedServers.length === 0;

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${llamaRunningCount}/${serversArr.length} LLM, ${whisperRunningCount}/${whisperServersArr.length} Whisper Running`}
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
					<HStack gap="3">
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
							display="flex"
							flexDirection="row"
							alignItems="center"
							justifyContent="center"
						>
							<Play size={15} />
							Launch LLaMa
						</Button>
						<Button
							size="sm"
							bg="var(--wc-accent-green-bg-12)"
							color="var(--wc-accent-green)"
							borderWidth="1px" borderColor="var(--wc-accent-green-border)"
							_hover={{ bg: 'var(--wc-accent-green-hover-bg)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="600"
							transition="all 0.2s ease"
							onClick={() => setShowWhisperLaunch(true)}
							display="flex"
							flexDirection="row"
							alignItems="center"
							justifyContent="center"
						>
							<Play size={15} />
							Launch Whisper
						</Button>
					</HStack>
				}
			/>

			<Box pt="76px" px="2" pb="2">
				{showEmptyState ? (
					<Flex
						h="300px" alignItems="center" justifyContent="center"
						borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" borderStyle="dashed"
					>
						<VStack gap="3" color="var(--wc-text-muted)">
							<Server size={40} />
							<Text fontSize="14px">{(serversArr.length + whisperServersArr.length) === 0 ? 'No servers running' : 'No matching servers'}</Text>
							<Text fontSize="12px" color="var(--wc-text-disabled)">{(serversArr.length + whisperServersArr.length) === 0 ? 'Click "Launch Server" or "Launch Whisper" to get started' : 'Try adjusting your filters or search query'}</Text>
						</VStack>
					</Flex>
				) : (
					<VStack align="stretch" gap="2">
						{unifiedServers.map(entry => {
							if (entry.__type === 'llama') {
								return (
									<ServerCard
										key={entry.server.id}
										serverId={entry.server.id}
										modelByPath={modelByPath}
										onShowLogs={setLogsServerId}
										onEdit={setEditingServerId}
										onSaveCheckpoint={setSaveCheckpointServerId}
										onLoadCheckpoint={setLoadCheckpointServerId}
										onConfirmDelete={setDeletingServerId}
									/>
								);
							}
							return (
								<WhisperServerCard
									key={entry.server.id}
									serverId={entry.server.id}
									modelByPath={whisperModelByPath}
									onShowLogs={setLogsWhisperServerId}
									onEdit={setEditingWhisperServerId}
									onConfirmDelete={setDeletingWhisperServerId}
								/>
							);
						})}
					</VStack>
				)}
			</Box>

			{showLaunch && (
				<LaunchServerDialog onClose={() => setShowLaunch(false)} />
			)}

			{logsServer && (
				<ServerLogs serverId={logsServer.id} serverName={logsServer.serverName} onClose={onCloseServerLogs} />
			)}

			{logsWhisperServerId && whisperServers[logsWhisperServerId] && (
				<WhisperServerLogs serverId={logsWhisperServerId} serverName={whisperServers[logsWhisperServerId]!.serverName} onClose={() => setLogsWhisperServerId(null)} />
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
