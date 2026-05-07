import React, { useState, useMemo, useEffect } from 'react';
import {
	Flex, Box, Text, HStack, VStack, Button, Input, Switch, Checkbox, Portal, Combobox, createListCollection,
} from '@chakra-ui/react';
import { Layers, Server, GitBranch, Check } from 'lucide-react';
import { ESplitMode, type ILaunchParams, parseDefaultArgsToParams as sharedParseDefaultArgsToParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { useStore } from '@/store';
import { SelectField, SliderNumberField, NumberField } from './Helpers';

type TBackendEntry = {
	id: string;
	name: string;
	primaryDevice: { name: string; vramFreeMb: number; vramTotalMb: number; id: string } | null;
};

type TGroupEntry = {
	id: string;
	name: string;
	backendCount: number;
	description: string;
	activeBackendName: string;
};

const BackendCombobox = React.memo(({ entries, selectedId, onSelect }: {
	entries: TBackendEntry[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) => {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean);
		return entries.filter(e => terms.every(term => `${e.name} ${e.primaryDevice?.name ?? ''}`.toLowerCase().includes(term)));
	}, [entries, inputValue]);
	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({ label: e.name, value: e.id, entry: e })),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	[filteredItems]);
	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => { const val = details.value?.[0]; if (val) onSelect(val); }}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedId ? [selectedId] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input
					placeholder="Search backends..."
					bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto" bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty><Text fontSize="12px" color="var(--wc-text-disabled)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TBackendEntry }).entry;
							return (
								<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-accent-blue-bg-8)' }}>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)" lineClamp={1}>{entry.name}</Text>
										<Text fontSize="10px" color="var(--wc-text-tertiary)">{entry.primaryDevice?.name ?? 'No devices detected'}</Text>
										</Box>
										{entry.primaryDevice && (
											<Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace' flexShrink={0}>
												{(entry.primaryDevice.vramFreeMb > 0 ? entry.primaryDevice.vramFreeMb : entry.primaryDevice.vramTotalMb) / 1024 | 0} GB
											</Text>
										)}
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

const GroupCombobox = React.memo(({ entries, selectedId, onSelect }: {
	entries: TGroupEntry[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) => {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean);
		return entries.filter(e => terms.every(term => `${e.name} ${e.description} ${e.activeBackendName}`.toLowerCase().includes(term)));
	}, [entries, inputValue]);
	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({ label: e.name, value: e.id, entry: e })),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	[filteredItems]);
	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => { const val = details.value?.[0]; if (val) onSelect(val); }}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedId ? [selectedId] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input
					placeholder="Search groups..."
					bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-accent-purple)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto" bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty><Text fontSize="12px" color="var(--wc-text-disabled)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TGroupEntry }).entry;
							return (
								<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
_hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-accent-purple-bg-8)' }}>
					<HStack gap="3" w="100%">
						<Box flex="1" minW="0">
							<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)" lineClamp={1}>{entry.name}</Text>
							<HStack gap="2" mt="0.5">
								<Text fontSize="10px" color="var(--wc-text-tertiary)">{entry.backendCount} backends</Text>
								{entry.description && <Text fontSize="10px" color="var(--wc-text-muted)">|</Text>}
								{entry.description && <Text fontSize="10px" color="var(--wc-text-muted)">{entry.description}</Text>}
							</HStack>
							<Text fontSize="10px" color="var(--wc-accent-purple-strong)" mt="0.5">Active: {entry.activeBackendName}</Text>
										</Box>
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

export type { TBackendEntry, TGroupEntry };

export const BackendPickerCard = React.memo(({
	params,
	onParamChange,
	meta,
	initialBackendId,
	initialGroupId,
	onSelection,
}: {
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
	meta: { nLayers: number; contextLength: number } | null;
	initialBackendId: string | null;
	initialGroupId: string | null;
	onSelection: (backendId: string | null, groupId: string | null) => void;
}) => {
	// Connect to Zustand for backends/groups
	const backends = useStore(s => s.backends);
	const groups = useStore(s => s.backendGroups);

	// Internal selection state (initialized from props)
	const [isGroup, setIsGroup] = useState(!!initialGroupId);
	const [selectedBackendId, setSelectedBackendId] = useState(initialBackendId);
	const [selectedBackendGroupId, setSelectedBackendGroupId] = useState(initialGroupId);

	// Report selection changes to dialog
	useEffect(() => {
		onSelection(selectedBackendId, selectedBackendGroupId);
	}, [selectedBackendId, selectedBackendGroupId, onSelection]);

	// Build backend entries from store
	const backendEntries = useMemo((): TBackendEntry[] =>
		Object.values(backends).map(b => ({
			id: b.id,
			name: b.name,
			primaryDevice: b.detectedDevices[0] ?? null,
		})),
		[backends]
	);

	// Build group entries from store
	const groupEntries = useMemo((): TGroupEntry[] =>
		Object.values(groups).map(g => ({
			id: g.id,
			name: g.name,
			backendCount: g.backendIds.length,
			description: g.description ?? '',
			activeBackendName: backends[g.activeBackendId]?.name ?? 'Unknown',
		})),
		[groups, backends]
	);

	// Resolve active backend
	const selectedBackend = useMemo(() => {
		if (isGroup && selectedBackendGroupId) {
			const group = groups[selectedBackendGroupId];
			return group ? backends[group.activeBackendId] ?? null : null;
		}
		return selectedBackendId ? backends[selectedBackendId] ?? null : null;
	}, [isGroup, selectedBackendGroupId, groups, backends, selectedBackendId]);

	// Device options from selected backend
	const devices = selectedBackend?.detectedDevices ?? [];
	const deviceOptions = useMemo(() => devices.map(d => d.id), [devices]);
	const deviceIdToName = useMemo(() => Object.fromEntries(
		devices.map(d => [d.id, `${d.name} (${d.backendType}) [${d.id}]`])
	), [devices]);

	// Internal device state
	const [device, setDevice] = useState(params.device ?? '');

	// Reset device when backend changes
	useEffect(() => {
		if (device && devices.length > 0 && !devices.some(d => d.id === device)) {
			setDevice('');
			onParamChange('device', '');
		}
	}, [devices, device]);

	// Backend defaults -- apply when backend first selected (new server)
	const appliedRef = React.useRef(false);
	useEffect(() => {
		if (initialBackendId || initialGroupId) {
			appliedRef.current = true;
		}
		if (selectedBackendId && selectedBackend && !appliedRef.current) {
			appliedRef.current = true;
			const defaults = sharedParseDefaultArgsToParams(selectedBackend.defaultArgs);
			if (defaults.flashAttn !== undefined) onParamChange('flashAttn', defaults.flashAttn);
			if (defaults.mlock !== undefined) onParamChange('mlock', defaults.mlock);
			if (defaults.mmap !== undefined) onParamChange('mmap', defaults.mmap);
			if (defaults.directIo !== undefined) onParamChange('directIo', defaults.directIo);
			if (defaults.noWarmup !== undefined) onParamChange('noWarmup', defaults.noWarmup);
			if (defaults.jinja !== undefined) onParamChange('jinja', defaults.jinja);
			if (defaults.swaFull !== undefined) onParamChange('swaFull', defaults.swaFull);
			// Apply -ngl from backend defaults to gpuLayers slider
			const nglIdx = selectedBackend.defaultArgs.indexOf('-ngl');
			if (nglIdx !== -1 && nglIdx + 1 < selectedBackend.defaultArgs.length) {
				const val = parseInt(selectedBackend.defaultArgs[nglIdx + 1] || "999", 10);
				if (!isNaN(val)) {
					onParamChange('gpuLayers', val);
					onParamChange('gpuLayersAuto', false);
				}
			}
		}
	}, [selectedBackendId, selectedBackend]); // eslint-disable-line react-hooks/exhaustive-deps

	// GPU layers auto
	const gpuLayersAuto = params.gpuLayersAuto ?? false;

	// Multi-GPU split values
	const [gpuSplitValues, setGpuSplitValues] = useState<number[]>(params.gpuSplitValues ?? []);

	// Initialize split values when multi-GPU enabled and devices available
	useEffect(() => {
		if (params.multiGpu && devices.length > 0) {
			const current = params.gpuSplitValues ?? [];
			if (current.length !== devices.length) {
				const values = devices.map((_, i) => current[i] ?? 1);
				setGpuSplitValues(values);
				onParamChange('gpuSplitValues', values);
			}
		}
	}, [params.multiGpu, devices.length]); // eslint-disable-line react-hooks/exhaustive-deps

	const maxLayers = meta?.nLayers ?? 999;

	const handleDeviceChange = (v: string) => {
		setDevice(v);
		onParamChange('device', v);
		const idx = devices.findIndex(d => d.id === v);
		if (idx >= 0) onParamChange('mainGpu', idx);
	};

	const handleSplitChange = (values: number[]) => {
		setGpuSplitValues(values);
		onParamChange('gpuSplitValues', values);
	};

	const handleSelect = (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => {
		onParamChange(key, value);
	};

	return (
		<Card>
			<VStack align="stretch" gap="3">
				<HStack gap="3" mb="2">
					<HStack gap="2" flex="1">
						<Button size="sm" variant="outline" flex="1" justifyContent="center"
							borderColor={!isGroup ? 'var(--wc-accent-purple-border)' : 'var(--wc-border-subtle)'}
							borderWidth={!isGroup ? '2px' : '1px'}
							color={!isGroup ? 'var(--wc-accent-purple)' : 'var(--wc-text-secondary)'}
							bg={!isGroup ? 'var(--wc-accent-purple-bg-8)' : 'var(--wc-bg-subtle)'}
							_hover={{ borderColor: !isGroup ? 'var(--wc-accent-purple-strong)' : 'var(--wc-border-hover)' }}
							onClick={() => { setIsGroup(false); setSelectedBackendGroupId(null); }}
						><Text fontSize="13px" fontWeight="500">Backend</Text></Button>
						<Button size="sm" variant="outline" flex="1" justifyContent="center"
borderColor={isGroup ? 'var(--wc-accent-purple-border)' : 'var(--wc-border-subtle)'}
						borderWidth={isGroup ? '2px' : '1px'}
						color={isGroup ? 'var(--wc-accent-purple)' : 'var(--wc-text-secondary)'}
						bg={isGroup ? 'var(--wc-accent-purple-bg-8)' : 'var(--wc-bg-subtle)'}
						_hover={{ borderColor: isGroup ? 'var(--wc-accent-purple-strong)' : 'var(--wc-border-hover)' }}
							onClick={() => { setIsGroup(true); setSelectedBackendId(null); }}
						><Text fontSize="13px" fontWeight="500">Group</Text></Button>
					</HStack>
				</HStack>

				{Object.values(backends).length === 0 && <Text fontSize="12px" color="var(--wc-text-disabled)">No backends registered. Go to Backends page.</Text>}
				{isGroup && Object.values(groups).length === 0 && <Text fontSize="12px" color="var(--wc-text-disabled)">No backend groups. Create one in Backends page.</Text>}
				{Object.values(backends).length > 0 && (
					isGroup ? (
						<Box>
							<GroupCombobox entries={groupEntries} selectedId={selectedBackendGroupId}
								onSelect={(id) => { setSelectedBackendGroupId(id); setSelectedBackendId(null); }} />
							{selectedBackendGroupId && groups[selectedBackendGroupId] && (
								<HStack mt="2" gap="4" px="3" py="2" bg="var(--wc-accent-purple-bg-8)" borderRadius="lg" borderWidth="1px" borderColor="var(--wc-accent-purple-border)">
									<HStack gap="1.5"><Layers size={12} color="var(--wc-accent-purple-icon)" /><Text fontSize="11px" color="var(--wc-accent-purple-text)">Active: {selectedBackend?.name ?? 'Unknown'}</Text></HStack>
									<HStack gap="1.5"><Server size={12} color="var(--wc-text-muted)" /><Text fontSize="11px" color="var(--wc-text-tertiary)">{groups[selectedBackendGroupId]?.backendIds.length ?? 0} backends</Text></HStack>
								</HStack>
							)}
						</Box>
					) : (
						<BackendCombobox entries={backendEntries} selectedId={selectedBackendId}
							onSelect={(id) => { setSelectedBackendId(id); setSelectedBackendGroupId(null); }} />
					)
				)}

				{deviceOptions.length > 0 && <VStack align="stretch" gap="4" mt="5">
					<SelectField label="Device" value={device} options={deviceOptions} onChange={handleDeviceChange} mono optionLabels={deviceIdToName} />

					<HStack justify="space-between" align="center">
						<VStack align="start" gap="0.5">
<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Autofit GPU Layers</Text>
						<Text fontSize="10px" color="var(--wc-text-muted)">Let llama.cpp auto-distribute layers</Text>
						</VStack>
						<Switch.Root label="Autofit GPU layers" checked={gpuLayersAuto} onCheckedChange={(d) => handleSelect('gpuLayersAuto', d.checked)} color={gpuLayersAuto ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: gpuLayersAuto ? 'var(--wc-accent-blue)' : 'var(--wc-bg-card)' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
						</Switch.Root>
					</HStack>

					{!gpuLayersAuto && (
						meta ? (
							<SliderNumberField label="GPU Layers" value={params.gpuLayers} onChange={v => handleSelect('gpuLayers', v)} min={0} max={maxLayers} suffix={`/ ${maxLayers} layers`} />
						) : (
							<NumberField label="GPU Layers" value={params.gpuLayers} onChange={v => handleSelect('gpuLayers', v)} min={0} max={999} />
						)
					)}

					<Box borderTopWidth="1px" borderColor="var(--wc-border-subtle)" pt="4">
						<HStack justify="space-between" align="center" mb="3">
							<HStack gap="3">
								<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
bg={(params.multiGpu ?? false) ? 'var(--wc-accent-green-bg-8)' : 'var(--wc-bg-subtle)'}>
								<GitBranch size={14} color={(params.multiGpu ?? false) ? 'var(--wc-accent-green)' : 'var(--wc-text-tertiary)'} />
								</Flex>
								<VStack align="start" gap="0.5">
<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Multi-GPU Split</Text>
								<Text fontSize="10px" color="var(--wc-text-muted)">Distribute layers across GPUs</Text>
								</VStack>
							</HStack>
							<Switch.Root label="Enable multi-GPU split" checked={params.multiGpu ?? false} onCheckedChange={(d) => handleSelect('multiGpu', d.checked)} color={(params.multiGpu ?? false) ? 'var(--wc-accent-green)' : 'var(--wc-text-tertiary)'}>
								<Switch.HiddenInput />
								<Switch.Control css={{ bg: (params.multiGpu ?? false) ? 'var(--wc-accent-green)' : 'var(--wc-bg-card)' }}>
									<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
								</Switch.Control>
							</Switch.Root>
						</HStack>

						{(params.multiGpu ?? false) && devices.length > 0 && (
							<VStack align="stretch" gap="3">
								{devices.map((dev, idx) => {
									const splitVal = gpuSplitValues[idx] ?? 0;
									const isActive = splitVal > 0;
									return (
										<HStack key={dev.id} gap="2" align="center">
											<Checkbox.Root checked={isActive} onCheckedChange={(d) => {
												const values = [...(gpuSplitValues ?? devices.map(() => 0))];
												values[idx] = d.checked ? 1 : 0;
												handleSplitChange(values);
											}} color="var(--wc-accent-blue)">
												<Checkbox.HiddenInput />
												<Checkbox.Control borderRadius="sm" bg={isActive ? 'var(--wc-accent-blue)' : 'var(--wc-bg-subtle)'}>
													<Checkbox.Indicator><Check size={12} /></Checkbox.Indicator>
												</Checkbox.Control>
											</Checkbox.Root>
											<Box flex="1" minW="0">
												<Text fontSize="11px" color="var(--wc-text-primary)" lineClamp={1}>{dev.name}</Text>
												<Text fontSize="10px" color="var(--wc-text-tertiary)">{dev.backendType} · {(dev.vramTotalMb / 1024).toFixed(1)} GB</Text>
											</Box>
											<HStack gap="1">
												<Text fontSize="10px" color="var(--wc-text-muted)" flexShrink={0}>GPU{idx}</Text>
												<Input type="number" value={splitVal} onChange={(e) => {
													const val = Math.max(0, Number(e.target.value));
													const values = [...(gpuSplitValues ?? devices.map(() => 0))];
													values[idx] = val;
													handleSplitChange(values);
												}} size="xs" w="60px" textAlign="right"
bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)"
													color="var(--wc-text-secondary)"
													fontSize="11px" borderRadius="md" min={0}
													_focus={{ borderColor: 'var(--wc-accent-green)', outline: 'none' }}
													disabled={!isActive}
												/>
											</HStack>
										</HStack>
									);
								})}
								<HStack justify="flex-end">
									<Button size="xs" variant="ghost" fontSize="10px" color="var(--wc-text-tertiary)"
										_hover={{ color: 'var(--wc-accent-green)', bg: 'var(--wc-accent-green-bg-8)' }}
										onClick={() => {
											const values = devices.map((_, i) => {
												const current = gpuSplitValues[i] ?? 0;
												return current > 0 ? 1 : 0;
											});
											handleSplitChange(values);
										}}>Equal distribution</Button>
								</HStack>
								<HStack gap="3">
									<SelectField label="Split Mode" value={params.splitMode ?? ESplitMode.LAYER} options={[ESplitMode.LAYER, ESplitMode.ROW, ESplitMode.TENSOR]} onChange={v => handleSelect('splitMode', v as ESplitMode)}
										optionLabels={{ [ESplitMode.LAYER]: 'Layer (pipeline)', [ESplitMode.ROW]: 'Row (weight matrix)', [ESplitMode.TENSOR]: 'Tensor (true TP)' }} />
								</HStack>
							</VStack>
						)}
					</Box>
				</VStack>}
			</VStack>
		</Card>
	);
});
