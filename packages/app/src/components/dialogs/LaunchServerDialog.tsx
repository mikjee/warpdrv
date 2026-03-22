import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Badge, Spinner, Portal, Combobox, useListCollection, useFilter, createListCollection
} from '@chakra-ui/react';
import {
	Play, X, ChevronDown, ChevronRight, Zap, Cpu, RefreshCw,
	Layers, Server, Gauge, Package, Bookmark,
	AlertTriangle, Check,
} from 'lucide-react';
import {
	EKvQuantType,
	type IModel, type IBackend, type ILaunchParams, type IServer,
	DEFAULT_LAUNCH_PARAMS,
	calculateVramEstimate, kvQuantToNumeric,
	type IPreset,
} from '@warpcore/shared';
import { Card } from '../Card';
import { VramBar } from '../VramBar';
import { useListQuery } from '../../hooks/useQuery';
import { fetchModels, fetchBackends, fetchPresets, launchServer, createPreset, updateServer } from '../../api/services';
import { useToast } from '../ToastProvider';

const KV_QUANT_OPTIONS = Object.values(EKvQuantType);

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24',
	MXFP4: '#a78bfa', F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)',
};

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
	return (
		<Button
			size="xs" px="3" py="1.5" h="auto" borderRadius="lg" fontSize="12px" fontWeight="500"
			bg={active ? 'rgba(51, 129, 255, 0.12)' : 'rgba(255, 255, 255, 0.03)'}
			color={active ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}
			borderWidth="1px"
			borderColor={active ? 'rgba(51, 129, 255, 0.3)' : 'rgba(255, 255, 255, 0.06)'}
			_hover={{ bg: active ? 'rgba(51, 129, 255, 0.18)' : 'rgba(255, 255, 255, 0.06)', color: active ? '#3381ff' : 'rgba(255, 255, 255, 0.6)' }}
			onClick={onClick} transition="all 0.15s ease"
		>
			{active && <Check size={12} />}
			{label}
		</Button>
	);
}

function SelectField({ label, value, options, onChange, mono, optionLabels }: {
	label: string; value: string; options: string[]; onChange: (v: string) => void; mono?: boolean; optionLabels?: Record<string, string>;
}) {
	const [open, setOpen] = useState(false);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const displayValue = optionLabels && optionLabels[value] ? optionLabels[value] : value;

	return (
		<Box position="relative" flex="1">
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<Button ref={buttonRef} w="100%" size="sm" variant="outline" justifyContent="space-between"
				bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
				fontFamily={mono ? '"Geist Mono", monospace' : undefined} fontSize="12px" borderRadius="lg"
				_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }} onClick={() => setOpen(!open)}
			>
				{displayValue}
				<ChevronDown size={14} />
			</Button>
			{open && buttonRef.current && (
				<Portal>
					<Box
						position="fixed"
						top={buttonRef.current.getBoundingClientRect().bottom + 4}
						left={buttonRef.current.getBoundingClientRect().left}
						w={buttonRef.current.getBoundingClientRect().width}
						bg="#18181b" borderWidth="1px"
						borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
						zIndex={9999} maxH="200px" overflowY="auto" py="1"
					>
						{options.map(opt => {
							const displayLabel = optionLabels && optionLabels[opt] ? optionLabels[opt] : opt;
							return (
								<Box key={opt} px="3" py="1.5" fontSize="12px" fontFamily={mono ? '"Geist Mono", monospace' : undefined}
									color={opt === value ? '#3381ff' : 'rgba(255, 255, 255, 0.6)'}
									bg={opt === value ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
									cursor="pointer" _hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
									onClick={() => { onChange(opt); setOpen(false); }}
								>
									{displayLabel}
								</Box>
							);
						})}
					</Box>
				</Portal>
			)}
		</Box>
	);
}

function NumberField({ label, value, onChange, suffix, min, max, step }: {
	label: string; value: number; onChange: (v: number) => void; suffix?: string; min?: number; max?: number; step?: number;
}) {
	return (
		<Box flex="1">
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">{label}</Text>
			<HStack gap="1.5">
				<Input type="number" value={value} onChange={e => onChange(Number(e.target.value))} size="sm"
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
					fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} min={min} max={max} step={step}
				/>
				{suffix && <Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" flexShrink={0}>{suffix}</Text>}
			</HStack>
		</Box>
	);
}

function formatSize(mb: number): string {
	if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
	return mb + ' MB';
}

type TModelEntry = {
	model: IModel;
	file: IModel['files'][number];
	label: string;
	searchText: string;
};

function ModelCombobox({ entries, selectedPath, onSelect }: {
	entries: TModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
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
					placeholder="Search models..."
					size="sm"
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
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1}>{entry.file.fileName}</Text>
											<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" mt="0.5">{entry.model.user}/{entry.model.name}</Text>
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
		params: ILaunchParams;
	};
}

export function LaunchServerDialog({ onClose, editMode }: ILaunchServerDialogProps) {
	const { toast } = useToast();

	// Fetch real data
	const modelsFetcher = useCallback(() => fetchModels(), []);
	const backendsFetcher = useCallback(() => fetchBackends(), []);
	const presetsFetcher = useCallback(() => fetchPresets(), []);
	const { data: models } = useListQuery<IModel>(modelsFetcher);
	const { data: backends } = useListQuery<IBackend>(backendsFetcher);
	const { data: presets } = useListQuery<IPreset>(presetsFetcher);

	// Selection state
	const [selectedModelPath, setSelectedModelPath] = useState<string | null>(editMode?.modelPath ?? null);
	const [selectedBackendId, setSelectedBackendId] = useState<string | null>(editMode?.backendId ?? null);
	const [modelSearch, setModelSearch] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showPresets, setShowPresets] = useState(false);
	const [presetName, setPresetName] = useState('');
	const [launching, setLaunching] = useState(false);

	// Params
	const [params, setParams] = useState<ILaunchParams>(editMode?.params ?? { ...DEFAULT_LAUNCH_PARAMS });

	const updateParam = <K extends keyof ILaunchParams>(key: K, value: ILaunchParams[K]) => {
		setParams(prev => ({ ...prev, [key]: value }));
	};

	const parseDefaultArgsToParams = (defaultArgs: string[]): Partial<ILaunchParams> => {
		const argsSet = new Set(defaultArgs);
		return {
			flashAttn: argsSet.has('-fa'),
			mlock: argsSet.has('--mlock'),
			mmap: !argsSet.has('--no-mmap'),
			directIo: argsSet.has('-dio'),
			noWarmup: argsSet.has('--no-warmup'),
			jinja: argsSet.has('--jinja'),
		};
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

	const filteredEntries = useMemo(() => {
		if (!modelSearch) return modelEntries;
		const term = modelSearch.toLowerCase();
		return modelEntries.filter(e => e.searchText.includes(term));
	}, [modelEntries, modelSearch]);

	const { collection } = useListCollection({
		initialItems: filteredEntries.map(entry => ({
			value: entry.file.filePath,
			label: entry.file.fileName,
			entry,
		})),
	});

	const selectedEntry = modelEntries.find(e => e.file.filePath === selectedModelPath);
	const selectedBackend = backends.find(b => b.id === selectedBackendId);

	useEffect(() => {
		if (selectedBackendId && selectedBackend && !editMode) {
			const defaultsFromBackend = parseDefaultArgsToParams(selectedBackend.defaultArgs);
			setParams(prev => ({ ...prev, ...defaultsFromBackend }));
		}
	}, [selectedBackendId, selectedBackend, editMode]);

	// Flatten all devices across all backends for the device dropdown
	const allDevices = backends.flatMap(b =>
		b.detectedDevices.map(d => ({ ...d, backendId: b.id }))
	);
	const deviceIdToName = Object.fromEntries(
		allDevices.map(d => [d.id, `${d.name} (${d.backendType}) [${d.id}]`])
	);
	const deviceOptions = allDevices.length > 0
		? allDevices.map(d => d.id)
		: [''];

	// VRAM estimate
	const meta = selectedEntry?.file.metadata;
	const vramEstimate = meta && selectedBackend ? calculateVramEstimate({
		sizeInMb: selectedEntry.model.totalSizeMb,
		nLayers: meta.nLayers,
		nKvHeads: meta.nKvHeads,
		embeddingDim: meta.embeddingDim,
		contextLength: params.contextSize > 0 ? params.contextSize : meta.contextLength,
		cacheType: kvQuantToNumeric(params.kvQuantK),
		gpuLayers: params.gpuLayers,
	}, selectedBackend.detectedDevices[0]?.vramFreeMb ?? selectedBackend.detectedDevices[0]?.vramTotalMb ?? 99999) : null;

	// Launch/Relaunch handler
	const handleLaunch = async () => {
		if (!selectedEntry || !selectedBackendId) return;
		setLaunching(true);

		if (editMode) {
			// Relaunch existing server with updated params
			const result = await updateServer(editMode.serverId, {
				backendId: selectedBackendId,
				modelPath: selectedEntry.file.filePath,
				mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
				params,
			});

			setLaunching(false);
			if (result.ok) {
				toast('success', 'Server relaunched with changes');
				onClose();
			} else {
				toast('error', result.error ?? 'Failed to relaunch server');
			}
		} else {
			// Launch new server
			const result = await launchServer({
				backendId: selectedBackendId,
				modelPath: selectedEntry.file.filePath,
				mmprojPath: selectedEntry.model.mmprojFile?.filePath ?? null,
				modelAlias: selectedEntry.file.fileName.replace('.gguf', ''),
				params,
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

	// Save preset handler
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
		setParams(preset.params);
		setShowPresets(false);
		toast('info', `Loaded preset "${preset.name}"`);
	};

	const canLaunch = selectedModelPath && selectedBackendId && !launching;

	return (
		<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
			<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={onClose} />

			<Box position="relative" w="920px" maxH="90vh" bg="#0f0f12" borderWidth="1px"
				borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl"
				shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column"
			>
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center"
							bgGradient={editMode ? "to-br" : "to-br"}
							gradientFrom={editMode ? "rgba(251, 191, 36, 0.2)" : "rgba(51, 129, 255, 0.2)"}
							gradientTo={editMode ? "rgba(245, 158, 11, 0.2)" : "rgba(167, 139, 250, 0.2)"}
							borderWidth="1px" borderColor={editMode ? "rgba(251, 191, 36, 0.2)" : "rgba(51, 129, 255, 0.2)"}
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
								<Bookmark size={14} />
								Presets
							</Button>
						)}
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
							<X size={16} />
						</Button>
					</HStack>
				</Flex>

				{/* Preset panel (slides down) - only in create mode */}
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
						{/* Left — Model + Backend */}
						<VStack align="stretch" gap="5" flex="1" minW="0">
							{/* Model picker */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">1. Select Model</Text>
								{models.length === 0 ? (
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No models scanned. Go to Settings and scan.</Text>
								) : (
									<ModelCombobox
										entries={modelEntries}
										selectedPath={selectedModelPath}
										onSelect={setSelectedModelPath}
									/>
								)}
								{selectedEntry?.file.metadata && (
									<HStack mt="2" gap="4" px="3" py="2" bg="rgba(51, 129, 255, 0.04)" borderRadius="lg" borderWidth="1px" borderColor="rgba(51, 129, 255, 0.1)">
										<HStack gap="1.5"><Layers size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)">{selectedEntry.file.metadata.nLayers} layers</Text></HStack>
										<HStack gap="1.5"><Cpu size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)">{selectedEntry.file.metadata.paramCount}</Text></HStack>
										{selectedEntry.model.mmprojFile && (
											<HStack gap="1.5"><Package size={12} color="#a78bfa" /><Text fontSize="11px" color="#a78bfa">mmproj detected</Text></HStack>
										)}
									</HStack>
								)}
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
						</VStack>

						{/* Right — Params */}
						<VStack align="stretch" gap="4" w="360px" flexShrink={0}>
							<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">3. Parameters</Text>

							<Card>
								<VStack align="stretch" gap="4">
									<Flex gap="4">
										<NumberField label="GPU Layers" value={params.gpuLayers} onChange={v => updateParam('gpuLayers', v)} min={0} max={999} />
										<NumberField label="Context Size" value={params.contextSize} onChange={v => updateParam('contextSize', v)} min={0} step={1024} suffix="0 = auto" />
									</Flex>
									<Flex gap="4">
										<NumberField label="Batch Size" value={params.batchSize} onChange={v => updateParam('batchSize', v)} min={1} step={256} />
										<NumberField label="Micro Batch" value={params.ubatchSize} onChange={v => updateParam('ubatchSize', v)} min={1} step={64} />
									</Flex>
									<Flex gap="4">
										<NumberField label="Threads" value={params.threads} onChange={v => updateParam('threads', v)} min={0} suffix="0 = auto" />
										<NumberField label="Threads (Batch)" value={params.threadsBatch} onChange={v => updateParam('threadsBatch', v)} min={0} suffix="0 = auto" />
									</Flex>
								</VStack>
							</Card>

							<Card>
								<VStack align="stretch" gap="3">
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Options</Text>
									<HStack gap="2" flexWrap="wrap">
										<ToggleChip label="Flash Attention" active={params.flashAttn} onClick={() => updateParam('flashAttn', !params.flashAttn)} />
										<ToggleChip label="MLock" active={params.mlock} onClick={() => updateParam('mlock', !params.mlock)} />
										<ToggleChip label="MMap" active={params.mmap} onClick={() => updateParam('mmap', !params.mmap)} />
										<ToggleChip label="Direct I/O" active={params.directIo} onClick={() => updateParam('directIo', !params.directIo)} />
										<ToggleChip label="No Warmup" active={params.noWarmup} onClick={() => updateParam('noWarmup', !params.noWarmup)} />
										<ToggleChip label="Jinja" active={params.jinja} onClick={() => updateParam('jinja', !params.jinja)} />
									</HStack>
								</VStack>
							</Card>

							<Card>
								<VStack align="stretch" gap="3">
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">KV Cache Quantization</Text>
									<Flex gap="4">
										<SelectField label="K Type" value={params.kvQuantK} options={KV_QUANT_OPTIONS} onChange={v => updateParam('kvQuantK', v as EKvQuantType)} mono />
										<SelectField label="V Type" value={params.kvQuantV} options={KV_QUANT_OPTIONS} onChange={v => updateParam('kvQuantV', v as EKvQuantType)} mono />
									</Flex>
								</VStack>
							</Card>

							{/* Advanced */}
							<Box>
								<Button w="100%" size="sm" variant="ghost" justifyContent="space-between" color="rgba(255, 255, 255, 0.35)" _hover={{ color: 'rgba(255, 255, 255, 0.6)', bg: 'rgba(255, 255, 255, 0.03)' }} borderRadius="lg" fontSize="12px" onClick={() => setShowAdvanced(!showAdvanced)}>
									Advanced Options
									{showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
								</Button>
								{showAdvanced && (
									<Card>
										<VStack align="stretch" gap="3" mt="2">
											<Box>
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Chat Template</Text>
												<Input placeholder="Auto-detect" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.chatTemplate} onChange={e => updateParam('chatTemplate', e.target.value)} />
											</Box>
											<NumberField label="Port" value={params.port} onChange={v => updateParam('port', v)} min={0} max={65535} suffix="0 = auto" />
											<Box>
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Device</Text>
												{allDevices.length > 0 ? (
													<SelectField label="" value={params.device} options={deviceOptions} onChange={v => updateParam('device', v)} mono optionLabels={deviceIdToName} />
												) : (
													<Input placeholder="Default" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.device} onChange={e => updateParam('device', e.target.value)} />
												)}
											</Box>
											<Box>
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Extra Arguments</Text>
												<Input placeholder="--some-flag value" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.extraArgs} onChange={e => updateParam('extraArgs', e.target.value)} />
											</Box>
										</VStack>
									</Card>
								)}
							</Box>

							{/* VRAM Estimate */}
							{vramEstimate && (
								<Box p="4" borderRadius="xl"
									bg={vramEstimate.willFit ? 'rgba(52, 211, 153, 0.04)' : 'rgba(251, 113, 133, 0.04)'}
									borderWidth="1px" borderColor={vramEstimate.willFit ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 113, 133, 0.15)'}
								>
									<HStack justify="space-between" mb="2">
										<HStack gap="1.5">
											{vramEstimate.willFit ? <Gauge size={14} color="#34d399" /> : <AlertTriangle size={14} color="#fb7185" />}
											<Text fontSize="12px" fontWeight="600" color={vramEstimate.willFit ? '#34d399' : '#fb7185'}>{vramEstimate.willFit ? 'Fits in VRAM' : 'May exceed VRAM'}</Text>
										</HStack>
										<Text fontSize="12px" fontFamily='"Geist Mono", monospace' color="rgba(255, 255, 255, 0.5)">~{(vramEstimate.safeEstimateMb / 1024).toFixed(1)} GB</Text>
									</HStack>
									<VramBar totalMb={vramEstimate.availableMb} usedMb={vramEstimate.safeEstimateMb} compact />
									<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" mt="1.5">Includes 577 MB safety buffer (95% confidence)</Text>
								</Box>
							)}
						</VStack>
					</Flex>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="2">
						{selectedModelPath && selectedBackendId && !editMode && (
							<HStack gap="2">
								<Input placeholder="Preset name..." size="sm" w="180px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(251, 191, 36, 0.4)', outline: 'none' }} value={presetName} onChange={e => setPresetName(e.target.value)} />
								<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }} borderRadius="lg" fontSize="12px" onClick={handleSavePreset} disabled={!presetName.trim()}>
									<Bookmark size={14} /> Save
								</Button>
							</HStack>
						)}
					</HStack>
					<HStack gap="2">
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
						<Button
							size="sm"
							disabled={!canLaunch}
							bgGradient="to-r"
							gradientFrom={editMode ? '#fbbf24' : '#3381ff'}
							gradientTo={editMode ? '#f59e0b' : '#5b6af5'}
							color={editMode ? "#18181b" : "white"}
							borderColor={editMode ? "rgba(251, 191, 36, 0.3)" : undefined}
							borderWidth="1px"
							_hover={{ opacity: 0.9, shadow: editMode ? '0 4px 20px rgba(251, 191, 36, 0.3)' : '0 4px 20px rgba(51, 129, 255, 0.3)' }}
							_disabled={{ opacity: 0.3, cursor: 'not-allowed' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="600"
							px="6"
							transition="all 0.2s ease"
							onClick={handleLaunch}
						>
							{launching ? <Spinner size="xs" /> : editMode ? <RefreshCw size={14} /> : <Play size={14} />}
							{editMode ? 'Relaunch with Changes' : 'Launch'}
						</Button>
					</HStack>
				</Flex>
			</Box>
		</Box>
	);
}
