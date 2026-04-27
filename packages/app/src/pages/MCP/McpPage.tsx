import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Flex, Text, HStack, VStack } from '@chakra-ui/react';
import { Plug, Plus, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { useStore } from '../../store';
import {
	fetchMcpConfig,
	updateMcpConfig,
	addMcpServer,
	removeMcpServerEntry,
	restartMcpServer,
	refreshMcpServerTools,
	reloadMcpServers,
	fetchMcpPermissions,
	setMcpServerPermission,
	setMcpToolPermission,
} from '../../api/mcpServices';
import { MCPServerCard } from './MCPServerCard';
import { AddServerForm } from './AddServerForm';
import { JsonEditorView } from './JsonEditorView';
import { ToolListSidebar } from './ToolListSidebar';
import type { IMcpConfigFile, IMcpServerEntry } from '@warpcore/shared';
import type { IMcpServerState, IToolPermission, IServerPermission as IMcpServerPermission } from '@warpcore/bridge';
import { EToolApprovalMode } from '@warpcore/bridge';

export function McpPage() {
	const mcpServers = useStore((s) => s.mcpServers);
	const [config, setConfig] = useState<IMcpConfigFile | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [viewMode, setViewMode] = useState<'cards' | 'json'>('cards');
	const [serverPerms, setServerPerms] = useState<IMcpServerPermission[]>([]);
	const [toolPerms, setToolPerms] = useState<IToolPermission[]>([]);

	const loadData = useCallback(async () => {
		const [configRes, permRes] = await Promise.all([
			fetchMcpConfig(),
			fetchMcpPermissions(),
		]);
		if (configRes.ok) setConfig(configRes.data);
		if (permRes.ok) {
			setServerPerms(permRes.data.servers);
			setToolPerms(permRes.data.tools);
		}
	}, []);

	useEffect(() => { loadData(); }, [loadData]);

	async function handleAddServer(name: string, entry: IMcpServerEntry) {
		await addMcpServer(name, entry);
		setShowAddForm(false);
		loadData();
	}

	async function handleRemoveServer(name: string) {
		await removeMcpServerEntry(name);
		loadData();
	}

	async function handleRestart(name: string) {
		await restartMcpServer(name);
	}

	async function handleRefresh(name: string) {
		await refreshMcpServerTools(name);
	}

	async function handleSaveConfig(newConfig: IMcpConfigFile) {
		await updateMcpConfig(newConfig);
		loadData();
	}

	async function handleToggleServer(name: string, enabled: boolean) {
		await setMcpServerPermission(name, enabled);
		loadData();
	}

	async function handleSetToolPermission(serverName: string, toolName: string, enabled: boolean, mode: EToolApprovalMode) {
		await setMcpToolPermission(serverName, toolName, enabled, mode);
		loadData();
	}

	const serverEntries = config?.mcpServers ?? {};
	const serverNames = useMemo(() => Object.keys(serverEntries), [serverEntries]);

	return (
		<Flex direction="column" h="100%" overflow="hidden">
			<PageHeader
				title="MCP"
				subtitle={`${Object.entries(serverEntries).length} Servers`}
				icon={<Plug size={20} />}
				actions={
					<HStack gap="2">
						{(['cards', 'json'] as const).map(m => (
							<Box
								key={m}
								as="button"
								px="3"
								py="1"
								fontSize="12px"
								borderRadius="sm"
								bg={viewMode === m ? 'rgba(255,255,255,0.1)' : 'transparent'}
								color={viewMode === m ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.4)'}
								onClick={() => setViewMode(m)}
							>
								{m === 'cards' ? 'Servers' : 'JSON'}
							</Box>
						))}
						<Box
							as="button"
							p="1.5"
							borderRadius="sm"
							_hover={{ bg: 'rgba(255,255,255,0.06)' }}
							onClick={() => reloadMcpServers()}
							title="Reload all servers"
						>
							<RefreshCw size={14} color="rgba(255,255,255,0.5)" />
						</Box>
						<Box
							as="button"
							p="1.5"
							borderRadius="sm"
							_hover={{ bg: 'rgba(255,255,255,0.06)' }}
							onClick={() => setShowAddForm(true)}
							title="Add server"
						>
							<Plus size={14} color="rgba(255,255,255,0.5)" />
						</Box>
					</HStack>
				}
			/>

			<Flex flex="1" overflow="hidden">
				<Box flex="1" overflow="auto" p="4">
					{showAddForm && (
						<AddServerForm
							onAdd={handleAddServer}
							onCancel={() => setShowAddForm(false)}
						/>
					)}

					{viewMode === 'cards' ? (
						<VStack gap="2" align="stretch">
							{Object.entries(serverEntries).map(([name, entry]) => (
								<MCPServerCard
									key={name}
									name={name}
									entry={entry}
									state={mcpServers[name] ?? null}
									onRestart={() => handleRestart(name)}
									onRefresh={() => handleRefresh(name)}
									onRemove={() => handleRemoveServer(name)}
								/>
							))}
							{Object.keys(serverEntries).length === 0 && !showAddForm && (
								<Text fontSize="13px" color="rgba(255,255,255,0.3)" textAlign="center" py="8">
									No MCP servers configured. Click + to add one, or edit the JSON directly.
								</Text>
							)}
						</VStack>
					) : (
						config && <JsonEditorView config={config} onSave={handleSaveConfig} />
					)}
				</Box>

				<ToolListSidebar
					serverNames={serverNames}
					mcpServers={mcpServers}
					serverPermissions={serverPerms}
					toolPermissions={toolPerms}
					onToggleServer={handleToggleServer}
					onSetToolPermission={handleSetToolPermission}
				/>
			</Flex>
		</Flex>
	);
}
