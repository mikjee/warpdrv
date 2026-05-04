import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Text, HStack, VStack, Button } from '@chakra-ui/react';
import { RefreshCw, Zap, X } from 'lucide-react';
import {
	type ILaunchParams, type ISpecDecodeParams,
	DEFAULT_LAUNCH_PARAMS, DEFAULT_SPEC_DECODE_PARAMS,
} from '@warpcore/shared';

import { launchServer, updateServer, updateModel } from '@/api/services';
import { useToast } from '@/components/ToastProvider';
import { useStore } from '@/store';

import { ModelPicker, TModelEntry } from './ModelPicker';
import { ServerInfoCard } from './ServerInfoCard';
import { BackendPickerCard } from './BackendPickerCard';
import { SpeculativeDecodingCard } from './SpeculativeDecodingCard';
import { ContextKVCard } from './ContextKVCard';
import { MultiModalCard } from './MultiModalCard';
import { RecommendedParamsCard } from './RecommendedParamsCard';
import { OptionsCard } from './OptionsCard';
import { Footer } from './Footer';

interface ILaunchServerDialogProps {
	onClose: () => void;
	serverId?: string;
}

export const LaunchServerDialog = React.memo(({ onClose, serverId }: ILaunchServerDialogProps) => {
	const { toast } = useToast();
	const server = useStore(s => serverId ? s.servers[serverId] : null);

	// Get records from Zustand store
	const backends = useStore((s) => s.backends);
	const groups = useStore((s) => s.backendGroups);
	const models = useStore((s) => s.models);

	const modelsArr = useMemo(() => Object.values(models), [models]);

	// Selection state
	const [selectedModelPath, setSelectedModelPath] = useState<string | null>(server?.modelPath ?? null);
	const [selectedBackendId, setSelectedBackendId] = useState<string | null>(server?.backendId ?? null);
	const [selectedBackendGroupId, setSelectedBackendGroupId] = useState<string | null>(server?.backendGroupId ?? null);
	const [serverName, setServerName] = useState<string>(server?.serverName ?? '');
	const [serverAliasesInput, setServerAliasesInput] = useState<string>(server?.serverAlias?.join(', ') ?? '');
	const [autoLaunch, setAutoLaunch] = useState<boolean>(server?.autoLaunch ?? false);
	const [autoSaveCheckpointOnStop, setAutoSaveCheckpointOnStop] = useState<boolean>(server?.autoSaveCheckpointOnStop ?? false);
	const [autoLoadCheckpointOnStart, setAutoLoadCheckpointOnStart] = useState<boolean>(server?.autoLoadCheckpointOnStart ?? false);
	const [useMultiModal, setUseMultiModal] = useState<boolean>(server?.useMultiModal ?? false);
	const [launching, setLaunching] = useState(false);
	const [useRecommendedInferParams, setUseRecommendedInferParams] = useState<boolean>(server?.useRecommendedInferenceParams ?? false);

	// Derive isGroup from which ID is set
	const isGroup = !!selectedBackendGroupId;

	// Params
	const [params, setParams] = useState<ILaunchParams>(server?.params ?? { ...DEFAULT_LAUNCH_PARAMS, specDecode: { ...DEFAULT_SPEC_DECODE_PARAMS } });

	const updateParam = <K extends keyof ILaunchParams>(key: K, value: ILaunchParams[K]) => {
		setParams(prev => ({ ...prev, [key]: value }));
	};

	const updateSpecParam = <K extends keyof ISpecDecodeParams>(key: K, value: ISpecDecodeParams[K]) => {
		setParams(prev => ({
			...prev,
			specDecode: { ...prev.specDecode, [key]: value },
		}));
	};

		// Flatten models to selectable file entries
	const modelEntries = useMemo((): TModelEntry[] => {
		if (!models) return [];
		return modelsArr.flatMap(m =>
			m.files
				.filter(f => !f.isMmproj)
				.filter(f => f.shardIndex === null || f.shardIndex === 1)
				.map(f => ({
					model: m,
					file: f,
					label: f.fileName,
					searchText: `${m.user} ${m.name} ${f.fileName} ${f.metadata?.quantType ?? ''} ${f.metadata?.paramCount ?? ''}`.toLowerCase(),
				}))
		);
	}, [modelsArr]);

	const selectedEntry = useMemo(() => modelEntries.find(e => e.file.filePath === selectedModelPath), [modelEntries, selectedModelPath]);

	// Resolve active backend (needed for spec decode device options + launch validation)
	const selectedBackend = useMemo(() => {
		if (isGroup && selectedBackendGroupId) {
			const group = groups[selectedBackendGroupId];
			return group ? backends[group.activeBackendId] ?? null : null;
		}
		return selectedBackendId ? backends[selectedBackendId] ?? null : null;
	}, [isGroup, selectedBackendGroupId, groups, backends, selectedBackendId]);

	// Device info for spec decode card
	const selectedBackendDevices = selectedBackend?.detectedDevices ?? [];
	const deviceIdToName = useMemo(() => Object.fromEntries(
		selectedBackendDevices.map(d => [d.id, `${d.name} (${d.backendType}) [${d.id}]`])
	), [selectedBackendDevices]);
	const deviceOptions = useMemo(() => selectedBackendDevices.map(d => d.id), [selectedBackendDevices]);

	// Draft model entries
	const targetArchitecture = selectedEntry?.file.metadata?.architecture ?? null;
	const draftModelEntries = useMemo(() => {
		if (!targetArchitecture) return [];
		return modelEntries.filter(e => {
			if (e.file.metadata?.architecture !== targetArchitecture) return false;
			if (e.file.filePath === selectedModelPath) return false;
			return true;
		});
	}, [modelEntries, targetArchitecture, selectedModelPath]);

	const selectedDraftEntry = modelEntries.find(e => e.file.filePath === params.specDecode.draftModelPath);

	// Model metadata
	const meta = selectedEntry?.file.metadata ?? null;

	// Aliases
	const parseAliases = useCallback((input: string): string[] => {
		return input.split(',').map(a => a.trim()).filter(a => a.length > 0);
	}, []);

	// Backend selection callback from card
	const handleBackendSelection = useCallback((backendId: string | null, groupId: string | null) => {
		setSelectedBackendId(backendId);
		setSelectedBackendGroupId(groupId);
	}, []);

	// Save without relaunch
	const handleSaveWithoutRelaunch = async () => {
		if (!selectedEntry || !server || (!selectedBackendId && !selectedBackendGroupId)) return;
		setLaunching(true);
		const aliases = parseAliases(serverAliasesInput);
		const result = await updateServer(server.id, {
			backendId: selectedBackendId ?? undefined,
			backendGroupId: selectedBackendGroupId ?? undefined,
			modelPath: selectedEntry.file.filePath,
			serverName: serverName.trim() || undefined, params, serverAlias: aliases,
			autoLaunch, autoSaveCheckpointOnStop, autoLoadCheckpointOnStart,
			useRecommendedInferenceParams: useRecommendedInferParams, useMultiModal,
		}, false);
		setLaunching(false);
		if (result.ok) { toast('success', 'Server config saved'); onClose(); }
		else toast('error', result.error ?? 'Failed to save server config');
	};

	// Launch/Relaunch
	const handleLaunch = async () => {
		if (!selectedEntry || (!selectedBackendId && !selectedBackendGroupId)) return;
		setLaunching(true);
		const aliases = parseAliases(serverAliasesInput);
		if (server) {
			const result = await updateServer(server.id, {
				backendId: selectedBackendId ?? undefined,
				backendGroupId: selectedBackendGroupId ?? undefined,
				modelPath: selectedEntry.file.filePath,
				serverName: serverName.trim() || undefined, params, serverAlias: aliases,
				autoLaunch, autoSaveCheckpointOnStop, autoLoadCheckpointOnStart,
				useRecommendedInferenceParams: useRecommendedInferParams, useMultiModal,
			}, true);
			setLaunching(false);
			if (result.ok) { toast('success', 'Server relaunched with changes'); onClose(); }
			else toast('error', result.error ?? 'Failed to relaunch server');
		} else {
			const result = await launchServer({
				backendId: selectedBackendId ?? undefined,
				backendGroupId: selectedBackendGroupId ?? undefined,
				modelPath: selectedEntry.file.filePath,
				serverName: serverName.trim() || null, params, serverAlias: aliases,
				autoLaunch, autoSaveCheckpointOnStop, autoLoadCheckpointOnStart,
				useRecommendedInferenceParams: useRecommendedInferParams, useMultiModal,
			});
			setLaunching(false);
			if (result.ok) { toast('success', `Server launched on port ${result.data.port}`); onClose(); }
			else toast('error', result.error ?? 'Failed to launch server');
		}
	};

	const canLaunch = selectedModelPath && (selectedBackendId || selectedBackendGroupId) && !launching;
	return (
		<Box position="fixed" inset="6px" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius="12px" overflow="hidden">
			<Box position="absolute" inset="0" bg="var(--w-servers-launch-overlay)" backdropFilter="blur(8px)" onClick={onClose} />
			<Box position="relative" w="960px" maxH="90vh" bg="var(--w-servers-launch-dialog-bg)" borderWidth="1px"
				borderColor="var(--w-servers-launch-dialog-border)" borderRadius="2xl"
				shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column"
			>
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--w-servers-launch-dialog-headerborder)" bg="var(--w-servers-launch-dialog-headerbg)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center"
							bgGradient="to-br"
							gradientFrom={server ? 'var(--w-servers-launch-icon-edit-from)' : 'var(--w-servers-launch-icon-new-from)'}
							gradientTo={server ? 'var(--w-servers-launch-icon-edit-to)' : 'var(--w-servers-launch-icon-new-to)'}
							borderWidth="1px" borderColor={server ? 'var(--w-servers-launch-icon-edit-border)' : 'var(--w-servers-launch-icon-new-border)'}
						>
							{server ? <RefreshCw size={18} color="var(--w-servers-launch-icon-edit-color)" /> : <Zap size={18} color="var(--w-servers-launch-icon-new-color)" />}
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="var(--w-servers-launch-title)" letterSpacing="-0.01em">{server ? 'Edit Server' : 'Launch Server'}</Text>
							<Text fontSize="12px" color="var(--w-servers-launch-subtitle)">{server ? 'Modify launch parameters — requires relaunch' : 'Configure and start a llama-server instance'}</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="var(--w-servers-launch-close-btn)" _hover={{ color: 'var(--w-servers-launch-close-hover)', bg: 'var(--w-servers-launch-close-hoverbg)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<Flex gap="6">
						{/* Left column */}
						<VStack align="stretch" gap="5" flex="1" minW="0">
							<ModelPicker modelCount={modelsArr.length} modelEntries={modelEntries} selectedModelPath={selectedModelPath} onSelectModel={setSelectedModelPath} selectedEntry={selectedEntry ?? null} />
							<ServerInfoCard serverName={serverName} onServerNameChange={setServerName} port={params.port} onPortChange={v => updateParam('port', v)} aliases={serverAliasesInput} onAliasesChange={setServerAliasesInput} placeholder={selectedEntry?.file.fileName.replace('.gguf', '') ?? 'Leave empty for auto-generated name'} />
							<BackendPickerCard
								params={params} onParamChange={updateParam} meta={meta}
								initialBackendId={server?.backendId ?? null} initialGroupId={server?.backendGroupId ?? null}
								onSelection={handleBackendSelection}
							/>
							<SpeculativeDecodingCard
								specDecode={params.specDecode} onSpecParamChange={updateSpecParam}
								targetArchitecture={targetArchitecture} draftModelEntries={draftModelEntries} selectedDraftEntry={selectedDraftEntry ?? null}
								deviceOptions={deviceOptions} deviceIdToName={deviceIdToName}
							/>
						</VStack>

						{/* Right column */}
						<VStack gap="5" flex="1" minW="0" align="stretch">
							<ContextKVCard params={params} onParamChange={updateParam} meta={meta} />
							<MultiModalCard useMultiModal={useMultiModal} onUseMultiModalChange={setUseMultiModal} hasMmproj={!!selectedEntry?.model.mmprojFile} />
							<RecommendedParamsCard
								useRecommended={useRecommendedInferParams} onUseRecommendedChange={setUseRecommendedInferParams}
								selectedEntry={selectedEntry ?? null}
								onSave={async (modelId, text) => {
									const newRecommendedParams = useRecommendedInferParams ? text : undefined;
									const result = await updateModel(modelId, { recommendedInferenceParams: newRecommendedParams ?? undefined });
									if (result.ok) toast('success', 'Recommended params saved to model');
									else toast('error', result.error ?? 'Failed to save recommended params');
								}}
							/>
							<OptionsCard params={params} onParamChange={updateParam} />
						</VStack>
					</Flex>
				</Box>

				{/* Footer */}
				<Footer
					isEdit={!!server} autoLaunch={autoLaunch} onAutoLaunchChange={setAutoLaunch}
					autoLoadCheckpoint={autoLoadCheckpointOnStart} onAutoLoadCheckpointChange={setAutoLoadCheckpointOnStart}
					autoSaveCheckpoint={autoSaveCheckpointOnStop} onAutoSaveCheckpointChange={setAutoSaveCheckpointOnStop}
					canLaunch={!!canLaunch} launching={launching}
					onCancel={onClose} onSave={handleSaveWithoutRelaunch} onLaunch={handleLaunch}
				/>
			</Box>
		</Box>
	);
});
