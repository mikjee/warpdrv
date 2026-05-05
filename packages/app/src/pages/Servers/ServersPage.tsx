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
import type { IServer, IBackend, IBackendGroup, IModel, TSortField, TSortOrder } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';
import { ServerCard } from './ServerCard';
import { LaunchServerDialog } from './LaunchServer/LaunchServerDialog';
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

	return (
		<Box>
			<PageHeader
				title="Servers"
				subtitle={`${serversArr.filter(s => s.status === EServerStatus.RUNNING).length} / ${serversArr.length} Running`}
				icon={<Server size={20} />}
				actions={
					<HStack gap="3">
						<InputGroup startElement={<Search size={14} color="var(--w-header-search-icon)" />} w="200px">
							<Input
								placeholder="Search servers..."
								size="sm"
								bg="var(--w-header-search-bg)"
								borderColor="var(--w-header-search-border)"
								color="var(--w-header-search-color)"
								fontSize="13px"
								borderRadius="lg"
								_placeholder={{ color: 'var(--w-header-search-placeholder)' }}
								_focus={{ borderColor: 'var(--w-header-search-focus-border)', outline: 'none' }}
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
													bg="var(--w-header-filter-btn-bg)"
													borderColor="var(--w-header-filter-btn-border)"
													color="var(--w-header-filter-btn-color)"
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
													bg="var(--w-header-combobox-bg)" borderWidth="1px" borderColor="var(--w-header-combobox-border)"
													borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
												>
													{sortCollection.items.map((item) => (
														<Combobox.Item
															key={item.value}
															item={item}
															px="3" py="2" borderRadius="md" cursor="pointer"
															_hover={{ bg: 'var(--w-header-combobox-item-hover)' }}
															_highlighted={{ bg: 'var(--w-header-combobox-bg)' }}
														>
															<Text fontSize="12px" color="var(--w-header-combobox-item-text)">{item.label}</Text>
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
								bg="var(--w-header-sortorder-btn-bg)"
								borderColor="var(--w-header-sortorder-btn-border)"
								color="var(--w-header-sortorder-btn-color)"
								borderRadius="md"
								_hover={{ borderColor: 'var(--w-header-sortorder-btn-hover-border)' }}
								title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
								onClick={() => handleSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc')}
							>
								{sortOrder === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownZA size={14} />}
							</Button>
						</HStack>
						<Switch.Root label="Show only running servers" checked={runningOnly} onCheckedChange={(details) => setRunningOnly(details.checked)} color={runningOnly ? 'var(--w-header-switch-active)' : 'var(--w-header-switch-inactive)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: runningOnly ? 'var(--w-header-switch-active)' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'var(--w-header-switch-thumb)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={runningOnly ? 'var(--w-header-switch-active)' : 'var(--w-header-switch-inactive)'} userSelect="none">
								Running only
							</Switch.Label>
						</Switch.Root>
					</HStack>
				}
				actionsRight={
					<Button
						size="sm"
						bg="var(--w-header-action-btn-bg)"
						color="var(--w-header-action-btn-color)"
						borderWidth="1px" borderColor="var(--w-header-action-btn-border)"
						_hover={{ bg: 'var(--w-header-action-btn-hover-bg)' }}
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
		</Box>
	);
});
