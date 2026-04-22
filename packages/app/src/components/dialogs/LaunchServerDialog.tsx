import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Slider, Badge, Spinner, Portal, Combobox, createListCollection, Switch,
} from '@chakra-ui/react';
import {
	Play, X, ChevronDown, RefreshCw, Zap, Cpu,
	Layers, Server, Package, Bookmark, Sparkles,
	Pencil, Check, ChevronRight
} from 'lucide-react';
import {
	EKvQuantType,
	type IModel, type IBackend, type IBackendGroup, type ILaunchParams, type IServer, type IChatInferenceParams,
	type ISpecDecodeParams,
	DEFAULT_LAUNCH_PARAMS, DEFAULT_SPEC_DECODE_PARAMS,
	parseDefaultArgsToParams as sharedParseDefaultArgsToParams,
} from '@warpcore/shared';

import { Textarea } from '@chakra-ui/react';
import { Card } from '../Card';
import { launchServer, updateServer, updateModel } from '../../api/services';
import { useToast } from '../ToastProvider';
import { useStore } from '../../store';

// ============================================================
// Shared sub-components
// ============================================================
export function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export function SelectField({ label, value, options, onChange, mono, optionLabels }: {
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

export function NumberField({ label, value, onChange, suffix, min, max, step }: {
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

// ============================================================
// Square root slider for context size
// ============================================================
// Maps a 0-100 slider position to a sqrt-scale value between min and max
// More linear than logarithmic, but still gives finer control at lower values
function sqrtSliderToValue(position: number, minVal: number, maxVal: number): number {
	if (position <= 0) return minVal;
	if (position >= 100) return maxVal;
	const t = position / 100;
	const value = minVal + t * t * (maxVal - minVal);
	// Round to nearest 256 for context size
	return Math.round(value / 256) * 256;
}

function valueToSqrtSlider(value: number, minVal: number, maxVal: number): number {
	if (value <= minVal) return 0;
	if (value >= maxVal) return 100;
	const t = Math.sqrt((value - minVal) / (maxVal - minVal));
	return t * 100;
}

// ============================================================
// Slider + Input row component
// ============================================================
function SliderNumberField({ label, value, onChange, min, max, step, suffix, logarithmic }: {
	label: string; value: number; onChange: (v: number) => void;
	min: number; max: number; step?: number; suffix?: string; logarithmic?: boolean;
}) {
	const sliderVal = logarithmic
		? valueToSqrtSlider(value, min, max)
		: ((value - min) / (max - min)) * 100;

	const handleSliderChange = (details: { value: number[] }) => {
		const pos = details.value[0] ?? 0;
		if (logarithmic) {
			onChange(sqrtSliderToValue(pos, min, max));
		} else {
			const val = Math.round(min + (pos / 100) * (max - min));
			onChange(val);
		}
	};

	return (
		<Box>
			<Flex justify="space-between" align="center" mb="1.5">
				<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">{label}</Text>
				{suffix && <Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">{suffix}</Text>}
			</Flex>
			<HStack gap="3">
				<Box flex="1">
					<Slider.Root
						min={0} max={100}
						value={[Math.max(0, Math.min(100, sliderVal))]}
						onValueChange={handleSliderChange}
						step={logarithmic ? 0.5 : (step ? (step / (max - min)) * 100 : 1)}
					>
						<Slider.Control>
							<Slider.Track h="6px" borderRadius="full" bg="rgba(255, 255, 255, 0.06)">
								<Slider.Range bg="rgba(51, 129, 255, 0.5)" borderRadius="full" />
							</Slider.Track>
							<Slider.Thumb
								index={0}
								w="14px" h="14px" borderRadius="full"
								bg="#3381ff" borderWidth="2px" borderColor="#0f0f12"
								shadow="0 2px 8px rgba(51, 129, 255, 0.3)"
								_hover={{ transform: 'scale(1.15)' }}
								transition="transform 0.1s ease"
							/>
						</Slider.Control>
					</Slider.Root>
				</Box>
				<Input
					type="number" value={value}
					onChange={e => {
						const v = Number(e.target.value);
						if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
					}}
					size="sm" w="100px"
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)"
					color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'
					fontSize="13px" borderRadius="lg" textAlign="right"
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
					min={min} max={max}
				/>
			</HStack>
		</Box>
	);
}

// ============================================================
// Main params panel
// ============================================================
const KV_QUANT_OPTIONS = Object.values(EKvQuantType);

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

const ModelCombobox = React.memo(({ entries, selectedPath, onSelect, placeholder }: {
	entries: TModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
	placeholder?: string;
}) => {
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
});

interface ILaunchServerDialogProps {
	onClose: () => void;
	editMode?: {
		serverId: string;
		backendId: string;
		backendGroupId?: string;
		modelPath: string;
		serverName: string;
		serverAlias: string[];
		params: ILaunchParams;
		autoLaunch?: boolean;
		autoSaveCheckpointOnStop?: boolean;
		autoLoadCheckpointOnStart?: boolean;
		useRecommendedInferenceParams?: boolean;
		useMultiModal?: boolean;
	};
}

export const LaunchServerDialog = React.memo(({ onClose, editMode }: ILaunchServerDialogProps) => {
	const { toast } = useToast();

	// Get backends and groups from Zustand store
	const backendsRecord = useStore((s) => s.backends);
	const backendGroupsRecord = useStore((s) => s.backendGroups);
	const modelsRecord = useStore((s) => s.models);

	const backends = useMemo(() => Object.values(backendsRecord), [backendsRecord]);
	const groups = useMemo(() => Object.values(backendGroupsRecord), [backendGroupsRecord]);
	const models = useMemo(() => Object.values(modelsRecord), [modelsRecord]);

	// Selection state
	const [selectedModelPath, setSelectedModelPath] = useState<string | null>(editMode?.modelPath ?? null);
	const [selectedBackendId, setSelectedBackendId] = useState<string | null>(editMode?.backendId ?? null);
	const [useBackendGroup, setUseBackendGroup] = useState<boolean>(!!editMode?.backendGroupId);
	const [selectedBackendGroupId, setSelectedBackendGroupId] = useState<string | null>(editMode?.backendGroupId ?? null);
	const [serverName, setServerName] = useState<string>(editMode?.serverName ?? '');
	const [serverAliasesInput, setServerAliasesInput] = useState<string>(editMode?.serverAlias?.join(', ') ?? '');
	const [autoLaunch, setAutoLaunch] = useState<boolean>(editMode?.autoLaunch ?? false);
	const [autoSaveCheckpointOnStop, setAutoSaveCheckpointOnStop] = useState<boolean>(editMode?.autoSaveCheckpointOnStop ?? false);
	const [autoLoadCheckpointOnStart, setAutoLoadCheckpointOnStart] = useState<boolean>(editMode?.autoLoadCheckpointOnStart ?? false);
	const [useMultiModal, setUseMultiModal] = useState<boolean>(editMode?.useMultiModal ?? false);
	const [launching, setLaunching] = useState(false);
	const [useRecommendedInferParams, setUseRecommendedInferParams] = useState<boolean>(editMode?.useRecommendedInferenceParams ?? true);
	const [recommendedText, setRecommendedText] = useState('');
	const [isEditingRecommended, setIsEditingRecommended] = useState(false);
	const originalTextRef = useRef('');

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

	// Generic param change handler for
	const handleTargetParamChange = (key: string, value: number | string | boolean) => {
		if (key === 'useMultiModal') {
			setUseMultiModal(value as boolean);
		} else {
			updateParam(key as keyof ILaunchParams, value as ILaunchParams[keyof ILaunchParams]);
		}
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

	const selectedEntry = useMemo(() => modelEntries.find(e => e.file.filePath === selectedModelPath), [
		modelEntries,
		selectedModelPath
	]);
	
	const selectedBackend = useBackendGroup && selectedBackendGroupId
		? backends.find(b => b.id === groups.find(g => g.id === selectedBackendGroupId)?.activeBackendId)
		: backends.find(b => b.id === selectedBackendId);

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

	// Populate recommended params text when model changes
	useEffect(() => {
		const text = selectedEntry?.model.recommendedInferenceParams ?? '';
		setRecommendedText(text);
		originalTextRef.current = text;
		setIsEditingRecommended(false);
	}, [selectedEntry]);

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
				swaFull: defaultsFromBackend.swaFull ?? false,
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

	// Save recommended params to model
	const handleSaveRecommendedParams = async () => {
		if (!selectedEntry) return;
		const newRecommendedParams = useRecommendedInferParams ? recommendedText.trim() : undefined;
		if (newRecommendedParams !== selectedEntry.model.recommendedInferenceParams) {
			const result = await updateModel(selectedEntry.model.id, { recommendedInferenceParams: newRecommendedParams || undefined });
			if (result.ok) {
				toast('success', 'Recommended params saved to model');
			} else {
				toast('error', result.error ?? 'Failed to save recommended params');
			}
		}
	};

	// Save without relaunch (edit mode)
	const handleSaveWithoutRelaunch = async () => {
		if (!selectedEntry || !editMode || (!selectedBackendId && !selectedBackendGroupId)) return;
		setLaunching(true);

		await handleSaveRecommendedParams();

		const aliases = parseAliases(serverAliasesInput);
		const backendId = !useBackendGroup ? selectedBackendId ?? undefined : undefined;
		const backendGroupId = useBackendGroup ? selectedBackendGroupId ?? undefined : undefined;
		const result = await updateServer(editMode.serverId, {
			backendId,
			backendGroupId,
			modelPath: selectedEntry.file.filePath,
			serverName: serverName.trim() || undefined,
			params,
			serverAlias: aliases,
			autoLaunch,
			autoSaveCheckpointOnStop,
			autoLoadCheckpointOnStart,
			useRecommendedInferenceParams: useRecommendedInferParams,
			useMultiModal,
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
		if (!selectedEntry || (!useBackendGroup ? !selectedBackendId : !selectedBackendGroupId)) return;
		setLaunching(true);

		await handleSaveRecommendedParams();

		const aliases = parseAliases(serverAliasesInput);
		const backendId = !useBackendGroup ? selectedBackendId ?? undefined : undefined;
		const backendGroupId = useBackendGroup ? selectedBackendGroupId ?? undefined : undefined;
		if (editMode) {
			const result = await updateServer(editMode.serverId, {
				backendId,
				backendGroupId,
				modelPath: selectedEntry.file.filePath,
				serverName: serverName.trim() || undefined,
				params,
				serverAlias: aliases,
				autoLaunch,
				autoSaveCheckpointOnStop,
				autoLoadCheckpointOnStart,
				useRecommendedInferenceParams: useRecommendedInferParams,
				useMultiModal,
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
				backendId,
				backendGroupId,
				modelPath: selectedEntry.file.filePath,
				serverName: serverName.trim() || null,
				params,
				serverAlias: aliases,
				autoLaunch,
				autoSaveCheckpointOnStop,
				autoLoadCheckpointOnStart,
				useRecommendedInferenceParams: useRecommendedInferParams,
				useMultiModal,
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

	const canLaunch = selectedModelPath && (!useBackendGroup ? selectedBackendId : selectedBackendGroupId) && !launching;

	const [showAdvanced, setShowAdvanced] = useState(true);
	const maxLayers = meta?.nLayers ?? 999;
	const maxContext = meta?.contextLength ?? 131072;
	const modelContextLength = meta?.contextLength ?? null;

	return (
		<Box position="fixed" inset="15px" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius={"12px"} overflow={"hidden"}>
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
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
							<X size={16} />
						</Button>
					</HStack>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<Flex gap="6">
						{/* Left — Model + Backend + Spec Decode */}
						<VStack align="stretch" gap="5" flex="1" minW="0">

							{/* Model picker */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Model</Text>
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

							{/* Port */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Server Port</Text>
								<HStack gap="1.5">
									<Input type="number" value={params.port} onChange={e => updateParam('port', Number(e.target.value))} size="sm"
										bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
										fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
										_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} min={0} max={65535}
									/>
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" flexShrink={0}>0 = auto</Text>
								</HStack>
							</Box>

							{/* Server aliases */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Proxy Aliases <Text as="span" color="rgba(255, 255, 255, 0.25)" fontWeight="400">(optional)</Text></Text>
								<Input value={serverAliasesInput} onChange={e => setServerAliasesInput(e.target.value)}
									placeholder="alias1, alias2, alias3"
									bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
									fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
									_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
								/>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" mt="1.5">Comma-separated aliases for proxy routing.</Text>
							</Box>

							{/* Backend picker */}
							<Box>
								<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Backend</Text>
								<VStack align="stretch" gap="3">
									{/* Backend source toggle */}
									<HStack gap="3" mb="2">
										<HStack gap="2" flex="1">
											<Button
												size="sm"
												variant="outline"
												flex="1"
												justifyContent="center"
												borderColor={useBackendGroup ? 'rgba(255, 255, 255, 0.08)' : 'rgba(167, 139, 250, 0.3)'}
												borderWidth={useBackendGroup ? '1px' : '2px'}
												color={useBackendGroup ? 'rgba(255, 255, 255, 0.4)' : '#a78bfa'}
												bg={useBackendGroup ? 'rgba(255, 255, 255, 0.02)' : 'rgba(167, 139, 250, 0.05)'}
												_hover={{ borderColor: useBackendGroup ? 'rgba(255, 255, 255, 0.15)' : 'rgba(167, 139, 250, 0.5)' }}
												onClick={() => setUseBackendGroup(false)}
											>
												<Text fontSize="13px" fontWeight="500">Direct</Text>
											</Button>
											<Button
												size="sm"
												variant="outline"
												flex="1"
												justifyContent="center"
												borderColor={useBackendGroup ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.08)'}
												borderWidth={useBackendGroup ? '2px' : '1px'}
												color={useBackendGroup ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}
												bg={useBackendGroup ? 'rgba(167, 139, 250, 0.05)' : 'rgba(255, 255, 255, 0.02)'}
												_hover={{ borderColor: useBackendGroup ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
												onClick={() => setUseBackendGroup(true)}
											>
												<Text fontSize="13px" fontWeight="500">Group</Text>
											</Button>
										</HStack>
									</HStack>

									{useBackendGroup ? (
										<Box>
											{backends.length === 0 && (
												<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No backends registered. Go to Backends page.</Text>
											)}
											{groups.length === 0 && (
												<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No backend groups. Create one in Backends page.</Text>
											)}
											{backends.length > 0 && groups.length > 0 && (
												<VStack align="stretch" gap="2">
													{groups.map((group: IBackendGroup) => {
														const isSelected = selectedBackendGroupId === group.id;
														const activeBackend = backends.find(b => b.id === group.activeBackendId);
														return (
															<HStack key={group.id} gap="3" px="4" py="3" borderRadius="lg" cursor="pointer"
																bg={isSelected ? 'rgba(167, 139, 250, 0.08)' : 'rgba(255, 255, 255, 0.02)'}
																borderWidth="1px" borderColor={isSelected ? 'rgba(167, 139, 250, 0.25)' : 'rgba(255, 255, 255, 0.06)'}
																_hover={{ borderColor: isSelected ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.1)' }}
																onClick={() => { setSelectedBackendGroupId(group.id); setSelectedBackendId(null); }} transition="all 0.15s ease"
															>
																<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg={isSelected ? 'rgba(167, 139, 250, 0.12)' : 'rgba(255, 255, 255, 0.04)'} flexShrink={0}>
																	<Layers size={16} color={isSelected ? '#a78bfa' : 'rgba(255, 255, 255, 0.35)'} />
																</Flex>
																<Box flex="1" minW="0">
																	<HStack justify="space-between" mb="0.5">
																		<Text fontSize="13px" fontWeight="500" color={isSelected ? '#e4e4e7' : 'rgba(255, 255, 255, 0.6)'}>{group.name}</Text>
																	</HStack>
																	<HStack gap="2">
																		<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">{group.backendIds.length} backends</Text>
																		{group.description && <Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">|</Text>}
																		{group.description && <Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">{group.description}</Text>}
																	</HStack>
																	<HStack gap="2" mt="1">
																		<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)">Active:</Text>
																		<Text fontSize="11px" fontWeight="500" color="#a78bfa">{activeBackend?.name ?? 'Unknown'}</Text>
																	</HStack>
																</Box>
															</HStack>
														);
													})}
												</VStack>
											)}
										</Box>
									) : (
										<Box>
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
														onClick={() => { setSelectedBackendId(backend.id); setSelectedBackendGroupId(null); }} transition="all 0.15s ease"
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
										</Box>
									)}
								</VStack>
							</Box>

							{/* Device selection — only if devices available */}
							{deviceOptions.length > 0 && (
								<Card>
									<SelectField
										label="Device"
										value={params.device}
										options={deviceOptions}
										onChange={v => handleTargetParamChange('device', v)}
										mono
										optionLabels={deviceIdToName}
									/>
								</Card>
							)}

							{/* GPU Layers + Context — sliders when model is selected */}
							<Card>
								<VStack align="stretch" gap="4">
									{params.gpuLayers ? (
										<SliderNumberField
											label="GPU Layers"
											value={params.gpuLayers}
											onChange={v => handleTargetParamChange('gpuLayers', v)}
											min={0} max={maxLayers}
											suffix={`/ ${maxLayers} layers`}
										/>
									) : (
										<NumberField label="GPU Layers" value={params.gpuLayers} onChange={v => handleTargetParamChange('gpuLayers', v)} min={0} max={999} />
									)}
									{modelContextLength ? (
										<SliderNumberField
											label="Context Size"
											value={params.contextSize}
											onChange={v => handleTargetParamChange('contextSize', v)}
											min={0} max={maxContext}
											suffix={params.contextSize === 0 ? '0 = auto' : `/ ${(maxContext / 1024).toFixed(0)}k max`}
											logarithmic
										/>
									) : (
										<NumberField label="Context Size" value={params.contextSize} onChange={v => handleTargetParamChange('contextSize', v)} min={0} step={1024} suffix="0 = auto" />
									)}
								</VStack>
							</Card>

							{/* KV quant */}
							<Card>
								<VStack align="stretch" gap="3">
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">KV Cache Quantization</Text>
									<Flex gap="4">
										<SelectField label="K Type" value={params.kvQuantK} options={KV_QUANT_OPTIONS} onChange={v => handleTargetParamChange('kvQuantK', v)} mono />
										<SelectField label="V Type" value={params.kvQuantV} options={KV_QUANT_OPTIONS} onChange={v => handleTargetParamChange('kvQuantV', v)} mono />
									</Flex>
								</VStack>
							</Card>

							{/* Parallel slots — target only */}
							<Card>
								<NumberField label="Parallel Slots" value={params.parallelSlots} onChange={v => handleTargetParamChange('parallelSlots', v)} min={0} suffix="0 = server default" />
							</Card>


						</VStack>

						{/* Right — Target Params Panel */}
						<VStack gap="5" flex="1" minW="0" align="stretch">
							<VStack align="stretch" gap="4">

								{/* Speculative Decoding Section */}
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

								{/* Multi-modal toggle */}
								<Card>
									<HStack justify="space-between" align="center">
										<VStack align="start" gap="0.5">
											<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Multi-modal</Text>
											<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)">Enable mmproj for vision models</Text>
										</VStack>
										<Switch.Root label="Use multi-modal (mmproj)" checked={useMultiModal} onCheckedChange={(details) => handleTargetParamChange('useMultiModal', details.checked)} disabled={!selectedEntry?.model.mmprojFile} color={useMultiModal ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}>
											<Switch.HiddenInput />
											<Switch.Control css={{ bg: useMultiModal ? '#a78bfa' : 'surface.4' }}>
												<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
											</Switch.Control>
										</Switch.Root>
									</HStack>
								</Card>

								{/* Toggle options */}
								<Card>
									<VStack align="stretch" gap="3">
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Options</Text>
										<HStack gap="2" flexWrap="wrap">
											<ToggleChip label="Flash Attention" active={params.flashAttn} onClick={() => handleTargetParamChange('flashAttn', !params.flashAttn)} />
											<ToggleChip label="MLock" active={params.mlock} onClick={() => handleTargetParamChange('mlock', !params.mlock)} />
											<ToggleChip label="MMap" active={params.mmap} onClick={() => handleTargetParamChange('mmap', !params.mmap)} />
											<ToggleChip label="Direct I/O" active={params.directIo} onClick={() => handleTargetParamChange('directIo', !params.directIo)} />
											<ToggleChip label="No Warmup" active={params.noWarmup} onClick={() => handleTargetParamChange('noWarmup', !params.noWarmup)} />
											<ToggleChip label="Jinja" active={params.jinja} onClick={() => handleTargetParamChange('jinja', !params.jinja)} />
											<ToggleChip label="SWA Full" active={params.swaFull} onClick={() => handleTargetParamChange('swaFull', !params.swaFull)} />
										</HStack>
									</VStack>
								</Card>

								{/* Batch sizes + threads */}
								<Card>
									<VStack align="stretch" gap="4">
										<Flex gap="4">
											<NumberField label="Batch Size" value={params.batchSize} onChange={v => handleTargetParamChange('batchSize', v)} min={1} step={256} />
											<NumberField label="Micro Batch" value={params.ubatchSize} onChange={v => handleTargetParamChange('ubatchSize', v)} min={1} step={64} />
										</Flex>
										<Flex gap="4">
											<NumberField label="Threads" value={params.threads} onChange={v => handleTargetParamChange('threads', v)} min={0} suffix="0 = auto" />
											<NumberField label="Threads (Batch)" value={params.threadsBatch} onChange={v => handleTargetParamChange('threadsBatch', v)} min={0} suffix="0 = auto" />
										</Flex>
									</VStack>
								</Card>

								{/* Recommended Model params */}
								<Box>
									<Card>
										<VStack align="stretch" gap="3">
											<HStack justify="space-between" align="center">
												<VStack align="start" gap="0.5">
													<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Recommended Params</Text>
													<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)">Use model-specific recommended Params</Text>
												</VStack>
												<Switch.Root label="Use recommended params" checked={useRecommendedInferParams} onCheckedChange={(details) => setUseRecommendedInferParams(details.checked)} color={useRecommendedInferParams ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
													<Switch.HiddenInput />
													<Switch.Control css={{ bg: useRecommendedInferParams ? '#3b86d6' : 'surface.4' }}>
														<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
													</Switch.Control>
												</Switch.Root>
											</HStack>
											{useRecommendedInferParams && (
												<Box position="relative">
													<Textarea
														value={recommendedText}
														variant={"subtle"}
														bg="rgb(30,30,30)"
														outline={"none"}
														onChange={(e) => setRecommendedText(e.target.value)}
														readOnly={!isEditingRecommended}
														opacity={isEditingRecommended ? 1 : 0.5}
														fontFamily="monospace"
														fontSize="12px"
														resize="vertical"
														minH="100px"
														borderRadius="lg"
														placeholder="No recommended params available for this model"
													/>
													<HStack position="absolute" bottom="2" right="2" gap="2">
														{isEditingRecommended && (
															<Button
																size="xs"
																variant="ghost"
																color="rgba(255, 255, 255, 0.6)"
																_hover={{ color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)' }}
																borderRadius="md"
																fontSize="10px"
																onClick={() => {
																	setRecommendedText(originalTextRef.current);
																	setIsEditingRecommended(false);
																}}
															>
																Cancel
															</Button>
														)}
														<Button
															size="xs"
															variant="outline"
															borderColor="rgba(255, 255, 255, 0.2)"
															color="rgba(255, 255, 255, 0.6)"
															_hover={{ borderColor: '#3b86d6', color: '#3b86d6', bg: 'rgba(51, 129, 255, 0.05)' }}
															borderRadius="md"
															fontSize="10px"
															gap="1"
															onClick={() => {
																if (isEditingRecommended) {
																	handleSaveRecommendedParams();
																	setIsEditingRecommended(false);
																} else {
																	originalTextRef.current = recommendedText;
																	setIsEditingRecommended(true);
																}
															}}
														>
															{isEditingRecommended ? <Check size={10} /> : <Pencil size={10} />}
															{isEditingRecommended ? 'Save' : 'Edit'}
														</Button>
													</HStack>
												</Box>
											)}
										</VStack>
									</Card>
								</Box>

								{/* Advanced section */}
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
													<Input placeholder="Auto-detect" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.chatTemplate} onChange={e => handleTargetParamChange('chatTemplate', e.target.value)} />
												</Box>
												<Box>
													<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Extra Arguments</Text>
													<Input placeholder="--some-flag value" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.extraArgs} onChange={e => handleTargetParamChange('extraArgs', e.target.value)} />
												</Box>
											</VStack>
										</Card>
									)}
								</Box>
							</VStack>

						</VStack>
					</Flex>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="4">
						<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(details) => setAutoLaunch(details.checked)} color={autoLaunch ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: autoLaunch ? '#3b86d6' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
								Auto-launch at startup
							</Switch.Label>
						</Switch.Root>
						<Switch.Root label="Auto-load latest checkpoint on start" checked={autoLoadCheckpointOnStart} onCheckedChange={(details) => setAutoLoadCheckpointOnStart(details.checked)} color={autoLoadCheckpointOnStart ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: autoLoadCheckpointOnStart ? '#3b86d6' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={autoLoadCheckpointOnStart ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
								Auto-load latest checkpoint on start
							</Switch.Label>
						</Switch.Root>
						<Switch.Root label="Auto-save checkpoint on stop" checked={autoSaveCheckpointOnStop} onCheckedChange={(details) => setAutoSaveCheckpointOnStop(details.checked)} color={autoSaveCheckpointOnStop ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: autoSaveCheckpointOnStop ? '#3b86d6' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={autoSaveCheckpointOnStop ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
								Auto-save all slots on stop
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
});