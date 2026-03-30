import { useState, useCallback, useEffect, useMemo } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Badge, Spinner, Portal, Combobox, createListCollection, Switch,
} from '@chakra-ui/react';
import {
	Play, X, ChevronDown, RefreshCw, Zap, Cpu,
	Layers, Server, Package, Bookmark, Sparkles,
} from 'lucide-react';
import {
	EKvQuantType,
	type IModel, type IBackend, type ILaunchParams, type IServer,
	type ISpecDecodeParams,
	DEFAULT_LAUNCH_PARAMS, DEFAULT_SPEC_DECODE_PARAMS,
	calculateVramEstimate, kvQuantToNumeric,
	type IPreset,
	parseDefaultArgsToParams as sharedParseDefaultArgsToParams,
} from '@warpcore/shared';
import { Card } from '../Card';
import { VramBar } from '../VramBar';
import { LaunchParamsPanel, EParamsMode, ToggleChip, SelectField, NumberField } from '../LaunchParamsPanel';
import { useListQuery } from '../../hooks/useQuery';
import { fetchModels, fetchBackends, fetchPresets, launchServer, createPreset, updateServer, fetchStickyRoutes, clearStickyRoute } from '../../api/services';
import type { IStickyRouteInfo } from '../../api/services';
import { useToast } from '../ToastProvider';

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24',
	MXFP4: '#a78bfa', F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)',
};

function formatSize(mb: number): string {
	if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
	return mb + ' MB';
}

function getModelDisplayName(modelName: string, file: IModel['files'][number]): string {
	if (file.shardIndex !== null && file.shardTotal !== null && file.shardTotal > 1) {
		const quant = file.metadata?.quantType ?? '';
		return quant ? `${modelName} ${quant}` : modelName;
	}
	return modelName;
}

type TModelEntry = {
	model: IModel;
	file: IModel['files'][number];
	label: string;
	searchText: string;
};

function ModelCombobox({ entries, selectedPath, onSelect, placeholder }: {
	entries: TModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
	placeholder?: string;
}) {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean);
		return entries.filter(e => terms.every(term => e.searchText.includes(term)));
	}, [entries, inputValue]);
	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({
				label: e.file.fileName,
				value: e.file.filePath,
				entry: e,
			})),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	[filteredItems]);
	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => {
				const val = details.value?.[0];
				if (val) onSelect(val);
			}}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedPath ? [selectedPath] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input
					placeholder={placeholder ?? 'Search models...'}
					bg="rgba(255, 255, 255, 0.03)"
					borderColor="rgba(255, 255, 255, 0.08)"
					color="rgba(255, 255, 255, 0.7)"
					fontSize="13px"
					borderRadius="lg"
					_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup>
					<Combobox.ClearTrigger />
					<Combobox.Trigger />
				</Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto"
						bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)" py="4" textAlign="center">No matches</Text>
						</Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TModelEntry }).entry;
							const qt = entry.file.metadata?.quantType ?? '?';
							const quantColor = QUANT_COLORS[qt] ?? 'rgba(255, 255, 255, 0.4)';
							return (
								<Combobox.Item
									key={item.value}
									item={item}
									px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
									_highlighted={{ bg: 'rgba(51, 129, 255, 0.08)' }}
								>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1}>{getModelDisplayName(entry.model.name, entry.file)}</Text>
											<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" mt="0.5">{entry.model.user}</Text>
										</Box>
										<HStack gap="2" flexShrink={0}>
											<Badge px="1.5" py="0" borderRadius="sm" fontSize="10px" fontWeight="600" bg={`color-mix(in srgb, ${quantColor} 12%, transparent)`} color={quantColor}>{qt}</Badge>
											<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>{formatSize(entry.model.totalSizeMb)}</Text>
										</HStack>
										<Combobox.ItemIndicator />
									</HStack>
								</Combobox.Item>
							);
						})}
					</Combobox.Content>
				</Combobox.Positioner>
			</Portal>
		</Combobox.Root>
	);
}

interface ILaunchServerDialogProps {
	onClose: () => void;
	editMode?: {
		serverId: string;
		backendId: string;
		modelPath: string;
		mmprojPath: string | null;
		serverName: string;
		serverAlias: string[];
		params: ILaunchParams;
		autoLaunch?: boolean;
	};
}

export function LaunchServerDialog({ onClose, editMode }: ILaunchServerDialogProps) {
	const { toast } = useToast();

	// Fetch real data
	const modelsFetcher = useCallback(() => fetchModels(), []);
	const backendsFetcher = useCallback(() => fetchBackends(), []);
	const presetsFetcher = useCallback(() => fetchPresets(), []);
	const stickyRoutesFetcher = useCallback(() => fetchStickyRoutes(), []);

	const { data: models } = useListQuery<IModel>(modelsFetcher, { pollInterval: 0 });
	const { data: backends } = useListQuery<IBackend>(backendsFetcher, { pollInterval: 0 });
	const { data: presets } = useListQuery<IPreset>(presetsFetcher, { pollInterval: 0 });
	const { data: stickyRoutes } = useListQuery<IStickyRouteInfo>(stickyRoutesFetcher, { pollInterval: 0 });

	// Selection state
	const [selectedModelPath, setSelectedModelPath] = useState<string | null>(editMode?.modelPath ?? null);
	const [selectedBackendId, setSelectedBackendId] = useState<string | null>(editMode?.backendId ?? null);
	const [serverName, setServerName] = useState<string>(editMode?.serverName ?? '');
	const [serverAliasesInput, setServerAliasesInput] = useState<string>(editMode?.serverAlias?.join(', ') ?? '');
	const [autoLaunch, setAutoLaunch] = useState<boolean>(editMode?.autoLaunch ?? false);
	const [showPresets, setShowPresets] = useState(false);
	const [presetName, setPresetName] = useState('');
	const [launching, setLaunching] = useState(false);

	// Params
	const [params, setParams] = useState<ILaunchParams>(editMode?.params ?? { ...DEFAULT_LAUNCH_PARAMS, specDecode: { ...DEFAULT_SPEC_DECODE_PARAMS } });

	const updateParam = <K extends keyof ILaunchParams>(key: K, value: ILaunchParams[K]) => {
		setParams(prev => ({ ...prev, [key]: value }));
	};

	const updateSpecParam = <K extends keyof ISpecDecodeParams>(key: K, value: ISpecDecodeParams[K]) => {
		setParams(prev => ({
			...prev,
			specDecode: { ...prev.specDecode, [key]: value },
		}));
	};

	// Generic param change handler for LaunchParamsPanel
	const handleTargetParamChange = (key: string, value: number | string | boolean) => {
		updateParam(key as keyof ILaunchParams, value as ILaunchParams[keyof ILaunchParams]);
	};

	// Draft param change handler — maps to specDecode sub-fields
	const handleDraftParamChange = (key: string, value: number | string | boolean) => {
		// Map the generic param keys to specDecode field names
		const draftKeyMap: Record<string, keyof ISpecDecodeParams> = {
			gpuLayers: 'draftGpuLayers',
			contextSize: 'draftContextSize',
			device: 'draftDevice',
		};
		const mappedKey = draftKeyMap[key];
		if (mappedKey) {
			updateSpecParam(mappedKey, value as ISpecDecodeParams[keyof ISpecDecodeParams]);
		}
		// Draft doesn't use the other params (batch, threads, kv quant etc. are inherited from target)
	};

	// Flatten models to selectable file entries
	const modelEntries = useMemo(() => {
		if (!models) return [];
		return models.flatMap(m =>
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
	}, [models]);

	const selectedEntry = modelEntries.find(e => e.file.filePath === selectedModelPath);
	const selectedBackend = backends.find(b => b.id === selectedBackendId);

	// Draft model entries — filtered by compatible architecture
	const targetArchitecture = selectedEntry?.file.metadata?.architecture ?? null;

	const draftModelEntries = useMemo(() => {
		if (!targetArchitecture) return [];
		return modelEntries.filter(e => {
			// Must match architecture
			if (e.file.metadata?.architecture !== targetArchitecture) return false;
			// Exclude the target model itself
			if (e.file.filePath === selectedModelPath) return false;
			return true;
		});
	}, [modelEntries, targetArchitecture, selectedModelPath]);

	const selectedDraftEntry = modelEntries.find(e => e.file.filePath === params.specDecode.draftModelPath);

	// Backend defaults — reset toggle flags to backend defaults when backend changes
	useEffect(() => {
		if (selectedBackendId && selectedBackend && !editMode) {
			const defaultsFromBackend = sharedParseDefaultArgsToParams(selectedBackend.defaultArgs);
			setParams(prev => ({
				...prev,
				flashAttn: defaultsFromBackend.flashAttn ?? false,
				mlock: defaultsFromBackend.mlock ?? false,
				mmap: defaultsFromBackend.mmap ?? false,
				directIo: defaultsFromBackend.directIo ?? false,
				noWarmup: defaultsFromBackend.noWarmup ?? false,
				jinja: defaultsFromBackend.jinja ?? false,
			}));
		}
	}, [selectedBackendId, selectedBackend, editMode]);

	// Reset device when backend changes
	useEffect(() => {
		if (selectedBackend && params.device) {
			const deviceIsValid = selectedBackend.detectedDevices.some(d => d.id === params.device);
			if (!deviceIsValid) updateParam('device', '');
		}
	}, [selectedBackendId]);

	// Device info from selected backend
	const selectedBackendDevices = selectedBackend?.detectedDevices ?? [];
	const deviceIdToName = Object.fromEntries(
		selectedBackendDevices.map(d => [d.id, `${d.name} (${d.backendType}) [${d.id}]`])
	);
	const deviceOptions = selectedBackendDevices.map(d => d.id);

	// Model metadata
	const meta = selectedEntry?.file.metadata ?? null;
	const draftMeta = selectedDraftEntry?.file.metadata ?? null;

	// Aliases
	const parseAliases = (input: string): string[] => {
		return input.split(',').map(a => a.trim()).filter(a => a.length > 0);
	};

	// Save without relaunch (edit mode)
	const handleSaveWithoutRelaunch = async () => {
		if (!selectedEntry || !selectedBackendId || !editMode) return;
		setLaunching(true);
		const aliases = parseAliases(serverAliasesInput);
		const result = await updateServer(editMode.serverId, {
			backendId: selectedBackendId,
			modelPath: selectedEntry.file.filePath,
			mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
			serverName: serverName.trim() || undefined,
			params,
			serverAlias: aliases,
			autoLaunch,
		}, false);
		setLaunching(false);
		if (result.ok) {
			toast('success', 'Server config saved');
			onClose();
		} else {
			toast('error', result.error ?? 'Failed to save server config');
		}
	};

	// Launch/Relaunch handler
	const handleLaunch = async () => {
		if (!selectedEntry || !selectedBackendId) return;
		setLaunching(true);
		const aliases = parseAliases(serverAliasesInput);
		if (editMode) {
			const result = await updateServer(editMode.serverId, {
				backendId: selectedBackendId,
				modelPath: selectedEntry.file.filePath,
				mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
				serverName: serverName.trim() || undefined,
				params,
				serverAlias: aliases,
				autoLaunch,
			}, true);
			setLaunching(false);
			if (result.ok) {
				toast('success', 'Server relaunched with changes');
				onClose();
			} else {
				toast('error', result.error ?? 'Failed to relaunch server');
			}
		} else {
			const result = await launchServer({
				backendId: selectedBackendId,
				modelPath: selectedEntry.file.filePath,
				mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
				serverName: serverName.trim() || null,
				params,
				serverAlias: aliases,
				autoLaunch,
			});
			setLaunching(false);
			if (result.ok) {
				toast('success', `Server launched on port ${result.data.port}`);
				onClose();
			} else {
				toast('error', result.error ?? 'Failed to launch server');
			}
		}
	};

	// Save preset
	const handleSavePreset = async () => {
		if (!presetName.trim() || !selectedEntry || !selectedBackendId) return;
		const result = await createPreset({
			name: presetName.trim(),
			backendId: selectedBackendId,
			modelPath: selectedEntry.file.filePath,
			mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
			params,
		});
		if (result.ok) {
			toast('success', `Preset "${presetName}" saved`);
			setPresetName('');
			setShowPresets(false);
		} else {
			toast('error', result.error ?? 'Failed to save preset');
		}
	};

	// Load preset
	const handleLoadPreset = (preset: IPreset) => {
		setSelectedModelPath(preset.modelPath);
		setSelectedBackendId(preset.backendId);
		// Ensure specDecode exists for older presets
		const loadedParams = {
			...DEFAULT_LAUNCH_PARAMS,
			...preset.params,
			specDecode: { ...DEFAULT_SPEC_DECODE_PARAMS, ...preset.params.specDecode },
		};
		setParams(loadedParams);
		setShowPresets(false);
		toast('info', `Loaded preset "${preset.name}"`);
	};

	const canLaunch = selectedModelPath && selectedBackendId && !launching;

	return (
		<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
			<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={onClose} />
			<Box position="relative" w="960px" maxH="90vh" bg="#0f0f12" borderWidth="1px"
				borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl"
				shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column"
			>
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center"
							bgGradient="to-br"
							gradientFrom={editMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(51, 129, 255, 0.2)'}
							gradientTo={editMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(167, 139, 250, 0.2)'}
							borderWidth="1px" borderColor={editMode ? 'rgba(251, 191, 36, 0.2)' : 'rgba(51, 129, 255, 0.2)'}
						>
							{editMode ? <RefreshCw size={18} color="#fbbf24" /> : <Zap size={18} color="#3381ff" />}
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="#e4e4e7" letterSpacing="-0.01em">{editMode ? 'Edit Server' : 'Launch Server'}</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)">{editMode ? 'Modify launch parameters — requires relaunch' : 'Configure and start a llama-server instance'}</Text>
						</Box>
					</HStack>
					<HStack gap="2">
						{!editMode && (
							<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="lg" fontSize="12px" onClick={() => setShowPresets(!showPresets)}>
								<Bookmark size={14} /> Presets
							</Button>
						)}
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
							<X size={16} />
						</Button>
					</HStack>
				</Flex>

				{/* Preset panel */}
				{showPresets && !editMode && (
					<Box px="6" py="4" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(251, 191, 36, 0.02)">
						{presets.length > 0 ? (
							<VStack align="stretch" gap="2">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Load a preset</Text>
								{presets.map((p: IPreset) => (
									<HStack key={p.id} px="3" py="2" borderRadius="md" cursor="pointer" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" _hover={{ borderColor: 'rgba(255, 255, 255, 0.12)' }} onClick={() => handleLoadPreset(p)}>
										<Bookmark size={12} color="#fbbf24" />
										<Text fontSize="12px" color="#e4e4e7" flex="1">{p.name}</Text>
										<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" fontFamily='"Geist Mono", monospace'>ctx {(p.params.contextSize / 1024).toFixed(0)}k</Text>
									</HStack>
								))}
							</VStack>
						) : (
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">No presets saved yet. Configure a launch and save it below.</Text>
						)}
					</Box>
				)}

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<Flex gap="6">
						{/* Left — Model + Backend + Spec Decode */}
						<VStack align="stretch" gap="5" flex="1" minW="0">
							{/* Model picker */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">1. Select Model</Text>
								{models.length === 0 ? (
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No models scanned. Go to Settings and scan.</Text>
								) : (
									<ModelCombobox entries={modelEntries} selectedPath={selectedModelPath} onSelect={setSelectedModelPath} />
								)}
								{selectedEntry?.file.metadata && (
									<HStack mt="2" gap="4" px="3" py="2" bg="rgba(51, 129, 255, 0.04)" borderRadius="lg" borderWidth="1px" borderColor="rgba(51, 129, 255, 0.1)">
										<HStack gap="1.5"><Layers size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)">{selectedEntry.file.metadata.nLayers} layers</Text></HStack>
										<HStack gap="1.5"><Cpu size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)">{selectedEntry.file.metadata.paramCount}</Text></HStack>
										<HStack gap="1.5"><Package size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)" fontFamily='"Geist Mono", monospace'>{formatSize(selectedEntry.model.totalSizeMb)}</Text></HStack>
										{selectedEntry.file.metadata.contextLength > 0 && (
											<HStack gap="1.5"><Text fontSize="11px" color="rgba(255, 255, 255, 0.4)">{(selectedEntry.file.metadata.contextLength / 1024).toFixed(0)}k ctx</Text></HStack>
										)}
										{selectedEntry.model.mmprojFile && (
											<HStack gap="1.5"><Package size={12} color="#a78bfa" /><Text fontSize="11px" color="#a78bfa">mmproj</Text></HStack>
										)}
									</HStack>
								)}
							</Box>

							{/* Server name */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Server Name <Text as="span" color="rgba(255, 255, 255, 0.25)" fontWeight="400">(optional)</Text></Text>
								<Input value={serverName} onChange={e => setServerName(e.target.value)}
									placeholder={selectedEntry?.file.fileName.replace('.gguf', '') ?? 'Leave empty for auto-generated name'}
									bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
									fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
									_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
								/>
							</Box>

							{/* Server aliases */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Server Aliases <Text as="span" color="rgba(255, 255, 255, 0.25)" fontWeight="400">(optional)</Text></Text>
								<Input value={serverAliasesInput} onChange={e => setServerAliasesInput(e.target.value)}
									placeholder="alias1, alias2, alias3"
									bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
									fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
									_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
								/>
								<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" mt="1.5">Comma-separated aliases for proxy routing.</Text>
							</Box>

							{/* Backend picker */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">2. Select Backend</Text>
								<VStack align="stretch" gap="2">
									{backends.length === 0 && (
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No backends registered. Go to Backends page.</Text>
									)}
									{backends.map((backend: IBackend) => {
										const isSelected = selectedBackendId === backend.id;
										const primaryDevice = backend.detectedDevices[0];
										return (
											<HStack key={backend.id} gap="3" px="4" py="3" borderRadius="lg" cursor="pointer"
												bg={isSelected ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)'}
												borderWidth="1px" borderColor={isSelected ? 'rgba(51, 129, 255, 0.25)' : 'rgba(255, 255, 255, 0.06)'}
												_hover={{ borderColor: isSelected ? 'rgba(51, 129, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)' }}
												onClick={() => setSelectedBackendId(backend.id)} transition="all 0.15s ease"
											>
												<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg={isSelected ? 'rgba(51, 129, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)'} flexShrink={0}>
													<Server size={16} color={isSelected ? '#3381ff' : 'rgba(255, 255, 255, 0.35)'} />
												</Flex>
												<Box flex="1" minW="0">
													<Text fontSize="13px" fontWeight="500" color={isSelected ? '#e4e4e7' : 'rgba(255, 255, 255, 0.6)'}>{backend.name}</Text>
													<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)" lineClamp={1}>{primaryDevice?.name ?? 'No devices detected'}</Text>
												</Box>
												{primaryDevice && (
													<Box textAlign="right" flexShrink={0}>
														<Text fontSize="11px" fontFamily='"Geist Mono", monospace' color="rgba(255, 255, 255, 0.5)">{(primaryDevice.vramFreeMb > 0 ? primaryDevice.vramFreeMb : primaryDevice.vramTotalMb) / 1024 | 0} GB</Text>
													</Box>
												)}
											</HStack>
										);
									})}
								</VStack>
							</Box>

							{/* Port */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">3. Port</Text>
								<HStack gap="1.5">
									<Input type="number" value={params.port} onChange={e => updateParam('port', Number(e.target.value))} size="sm"
										bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
										fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
										_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} min={0} max={65535}
									/>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" flexShrink={0}>0 = auto</Text>
								</HStack>
							</Box>

							{/* ============================================================ */}
							{/* Speculative Decoding Section */}
							{/* ============================================================ */}
							<Box>
								<Flex align="center" gap="3" mb="3">
									<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
										bg={params.specDecode.enabled ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255, 255, 255, 0.04)'}
									>
										<Sparkles size={14} color={params.specDecode.enabled ? '#a78bfa' : 'rgba(255, 255, 255, 0.3)'} />
									</Flex>
									<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" flex="1">Speculative Decoding</Text>
									<ToggleChip
										label={params.specDecode.enabled ? 'Enabled' : 'Disabled'}
										active={params.specDecode.enabled}
										onClick={() => updateSpecParam('enabled', !params.specDecode.enabled)}
									/>
								</Flex>

								{params.specDecode.enabled && (
									<Box
										p="4" borderRadius="xl"
										bg="rgba(167, 139, 250, 0.03)"
										borderWidth="1px" borderColor="rgba(167, 139, 250, 0.12)"
									>
										<VStack align="stretch" gap="4">
											{/* Draft model picker */}
											<Box>
												<Text fontSize="11px" color="rgba(167, 139, 250, 0.7)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Draft Model</Text>
												{!targetArchitecture ? (
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">Select a target model first to see compatible draft models.</Text>
												) : draftModelEntries.length === 0 ? (
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">
														No compatible draft models found. Draft models must share the same architecture ({targetArchitecture}).
													</Text>
												) : (
													<ModelCombobox
														entries={draftModelEntries}
														selectedPath={params.specDecode.draftModelPath || null}
														onSelect={(path) => updateSpecParam('draftModelPath', path)}
														placeholder="Search compatible draft models..."
													/>
												)}
												{selectedDraftEntry?.file.metadata && (
													<HStack mt="2" gap="4" px="3" py="2" bg="rgba(167, 139, 250, 0.04)" borderRadius="lg" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.1)">
														<HStack gap="1.5"><Layers size={12} color="rgba(167, 139, 250, 0.5)" /><Text fontSize="11px" color="rgba(167, 139, 250, 0.7)">{selectedDraftEntry.file.metadata.nLayers} layers</Text></HStack>
														<HStack gap="1.5"><Cpu size={12} color="rgba(167, 139, 250, 0.5)" /><Text fontSize="11px" color="rgba(167, 139, 250, 0.7)">{selectedDraftEntry.file.metadata.paramCount}</Text></HStack>
														<Text fontSize="11px" color="rgba(167, 139, 250, 0.5)" fontFamily='"Geist Mono", monospace'>{formatSize(selectedDraftEntry.model.totalSizeMb)}</Text>
													</HStack>
												)}
											</Box>

											{/* Draft device */}
											{deviceOptions.length > 0 && (
												<Box>
													<SelectField
														label="Draft Device"
														value={params.specDecode.draftDevice}
														options={['', ...deviceOptions]}
														onChange={v => updateSpecParam('draftDevice', v)}
														mono
														optionLabels={{
															'': 'Same as target',
															...deviceIdToName,
														}}
													/>
													<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)" mt="1">Leave empty to use target device.</Text>
												</Box>
											)}

											{/* Draft GPU layers + context */}
											<Flex gap="4">
												{draftMeta ? (
													<Box flex="1">
														<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">
															GPU Layers <Text as="span" color="rgba(255, 255, 255, 0.2)">/ {draftMeta.nLayers}</Text>
														</Text>
														<Input type="number" value={params.specDecode.draftGpuLayers} onChange={e => updateSpecParam('draftGpuLayers', Number(e.target.value))} size="sm"
															bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
															fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
															_focus={{ borderColor: 'rgba(167, 139, 250, 0.4)', outline: 'none' }} min={0} max={draftMeta.nLayers}
														/>
													</Box>
												) : (
													<NumberField label="GPU Layers" value={params.specDecode.draftGpuLayers} onChange={v => updateSpecParam('draftGpuLayers', v)} min={0} max={999} />
												)}
												<NumberField label="Context Size" value={params.specDecode.draftContextSize} onChange={v => updateSpecParam('draftContextSize', v)} min={0} step={1024} suffix="0 = auto" />
											</Flex>

											{/* Spec decode tuning params */}
											<Box>
												<Text fontSize="11px" color="rgba(167, 139, 250, 0.7)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Drafting Parameters</Text>
												<Flex gap="4">
													<NumberField label="Draft Max" value={params.specDecode.draftMax} onChange={v => updateSpecParam('draftMax', v)} min={1} max={128} />
													<NumberField label="Draft Min" value={params.specDecode.draftMin} onChange={v => updateSpecParam('draftMin', v)} min={0} max={64} />
													<Box flex="1">
														<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Accept Threshold</Text>
														<Input type="number" value={params.specDecode.draftPMin}
															onChange={e => updateSpecParam('draftPMin', Number(e.target.value))} size="sm"
															bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
															fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
															_focus={{ borderColor: 'rgba(167, 139, 250, 0.4)', outline: 'none' }}
															min={0} max={1} step={0.05}
														/>
														<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)" mt="1">0.0 - 1.0</Text>
													</Box>
												</Flex>
											</Box>
										</VStack>
									</Box>
								)}
							</Box>
						</VStack>

						{/* Right — Target Params Panel */}
						<Box gap="5" flex="1" minW="0">
							<LaunchParamsPanel
								mode={EParamsMode.TARGET}
								gpuLayers={params.gpuLayers}
								contextSize={params.contextSize}
								batchSize={params.batchSize}
								ubatchSize={params.ubatchSize}
								threads={params.threads}
								threadsBatch={params.threadsBatch}
								flashAttn={params.flashAttn}
								mlock={params.mlock}
								mmap={params.mmap}
								directIo={params.directIo}
								noWarmup={params.noWarmup}
								jinja={params.jinja}
								kvQuantK={params.kvQuantK}
								kvQuantV={params.kvQuantV}
								chatTemplate={params.chatTemplate}
								extraArgs={params.extraArgs}
								parallelSlots={params.parallelSlots}
								modelNLayers={meta?.nLayers ?? null}
								modelContextLength={meta?.contextLength ?? null}
								deviceOptions={deviceOptions}
								deviceIdToName={deviceIdToName}
								selectedDevice={params.device}
								onParamChange={handleTargetParamChange}
							/>
						</Box>
					</Flex>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="4">
						{selectedModelPath && selectedBackendId && !editMode && (
							<HStack gap="2">
								<Input placeholder="Preset name..." size="sm" w="180px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(251, 191, 36, 0.4)', outline: 'none' }} value={presetName} onChange={e => setPresetName(e.target.value)} />
								<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="lg" fontSize="12px" onClick={handleSavePreset} disabled={!presetName.trim()}>
									<Bookmark size={14} /> Save
								</Button>
							</HStack>
						)}
						<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(details) => setAutoLaunch(details.checked)} color={autoLaunch ? '#34d399' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control />
							<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? '#34d399' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
								Auto-launch at startup
							</Switch.Label>
						</Switch.Root>
					</HStack>
					<HStack gap="2">
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
						{editMode ? (
							<>
								<Button size="sm" disabled={!canLaunch || launching}
									bg="rgba(255, 255, 255, 0.08)" color="#e4e4e7" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.15)"
									_hover={{ bg: 'rgba(255, 255, 255, 0.12)', borderColor: 'rgba(255, 255, 255, 0.25)' }}
									_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5"
									onClick={handleSaveWithoutRelaunch}
								>Save</Button>
								<Button size="sm" disabled={!canLaunch || launching}
									bgGradient="to-r" gradientFrom="#fbbf24" gradientTo="#f59e0b" color="#18181b"
									borderWidth="1px" borderColor="rgba(251, 191, 36, 0.3)"
									_hover={{ opacity: 0.9, shadow: '0 4px 20px rgba(251, 191, 36, 0.3)' }}
									_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
									transition="all 0.2s ease" onClick={handleLaunch}
								>
									{launching ? <Spinner size="xs" /> : <RefreshCw size={14} />}
									Relaunch with Changes
								</Button>
							</>
						) : (
							<Button size="sm" disabled={!canLaunch || launching}
								bgGradient="to-r" gradientFrom="#3381ff" gradientTo="#5b6af5" color="white"
								_hover={{ opacity: 0.9, shadow: '0 4px 20px rgba(51, 129, 255, 0.3)' }}
								_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
								transition="all 0.2s ease" onClick={handleLaunch}
							>
								{launching ? <Spinner size="xs" /> : <Play size={14} />}
								Launch
							</Button>
						)}
					</HStack>
				</Flex>
			</Box>
		</Box>
	);
}