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
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty><Text fontSize="12px" color="rgba(255, 255, 255, 0.25)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TBackendEntry }).entry;
							return (
								<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }} _highlighted={{ bg: 'rgba(51, 129, 255, 0.08)' }}>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1}>{entry.name}</Text>
											<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)">{entry.primaryDevice?.name ?? 'No devices detected'}</Text>
										</Box>
										{entry.primaryDevice && (
											<Text fontSize="11px" color="rgba(255, 255, 255, 0.5)" fontFamily='"Geist Mono", monospace' flexShrink={0}>
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
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
					_focus={{ borderColor: 'rgba(167, 139, 250, 0.4)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty><Text fontSize="12px" color="rgba(255, 255, 255, 0.25)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TGroupEntry }).entry;
							return (
								<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }} _highlighted={{ bg: 'rgba(167, 139, 250, 0.08)' }}>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1}>{entry.name}</Text>
											<HStack gap="2" mt="0.5">
												<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)">{entry.backendCount} backends</Text>
												{entry.description && <Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">|</Text>}
												{entry.description && <Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">{entry.description}</Text>}
											</HStack>
											<Text fontSize="10px" color="rgba(167, 139, 250, 0.6)" mt="0.5">Active: {entry.activeBackendName}</Text>
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
	}, [devices]); // eslint-disable-line react-hooks/exhaustive-deps

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
							borderColor={!isGroup ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.08)'}
							borderWidth={!isGroup ? '2px' : '1px'}
							color={!isGroup ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}
							bg={!isGroup ? 'rgba(167, 139, 250, 0.05)' : 'rgba(255, 255, 255, 0.02)'}
							_hover={{ borderColor: !isGroup ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
							onClick={() => { setIsGroup(false); setSelectedBackendGroupId(null); }}
						><Text fontSize="13px" fontWeight="500">Backend</Text></Button>
						<Button size="sm" variant="outline" flex="1" justifyContent="center"
							borderColor={isGroup ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.08)'}
							borderWidth={isGroup ? '2px' : '1px'}
							color={isGroup ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}
							bg={isGroup ? 'rgba(167, 139, 250, 0.05)' : 'rgba(255, 255, 255, 0.02)'}
							_hover={{ borderColor: isGroup ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
							onClick={() => { setIsGroup(true); setSelectedBackendId(null); }}
						><Text fontSize="13px" fontWeight="500">Group</Text></Button>
					</HStack>
				</HStack>

				{Object.values(backends).length === 0 && <Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No backends registered. Go to Backends page.</Text>}
				{isGroup && Object.values(groups).length === 0 && <Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No backend groups. Create one in Backends page.</Text>}
				{Object.values(backends).length > 0 && (
					isGroup ? (
						<Box>
							<GroupCombobox entries={groupEntries} selectedId={selectedBackendGroupId}
								onSelect={(id) => { setSelectedBackendGroupId(id); setSelectedBackendId(null); }} />
							{selectedBackendGroupId && groups[selectedBackendGroupId] && (
								<HStack mt="2" gap="4" px="3" py="2" bg="rgba(167, 139, 250, 0.04)" borderRadius="lg" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.1)">
									<HStack gap="1.5"><Layers size={12} color="rgba(167, 139, 250, 0.5)" /><Text fontSize="11px" color="rgba(167, 139, 250, 0.7)">Active: {selectedBackend?.name ?? 'Unknown'}</Text></HStack>
									<HStack gap="1.5"><Server size={12} color="rgba(255, 255, 255, 0.35)" /><Text fontSize="11px" color="rgba(255, 255, 255, 0.5)">{groups[selectedBackendGroupId]?.backendIds.length ?? 0} backends</Text></HStack>
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
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Autofit GPU Layers</Text>
							<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">Let llama.cpp auto-distribute layers</Text>
						</VStack>
						<Switch.Root label="Autofit GPU layers" checked={gpuLayersAuto} onCheckedChange={(d) => handleSelect('gpuLayersAuto', d.checked)} color={gpuLayersAuto ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: gpuLayersAuto ? '#3381ff' : 'surface.4' }}>
								<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
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

					<Box borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" pt="4">
						<HStack justify="space-between" align="center" mb="3">
							<HStack gap="3">
								<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
									bg={(params.multiGpu ?? false) ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.04)'}>
									<GitBranch size={14} color={(params.multiGpu ?? false) ? '#34d399' : 'rgba(255, 255, 255, 0.3)'} />
								</Flex>
								<VStack align="start" gap="0.5">
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Multi-GPU Split</Text>
									<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">Distribute layers across GPUs</Text>
								</VStack>
							</HStack>
							<Switch.Root label="Enable multi-GPU split" checked={params.multiGpu ?? false} onCheckedChange={(d) => handleSelect('multiGpu', d.checked)} color={(params.multiGpu ?? false) ? '#34d399' : 'rgba(255, 255, 255, 0.4)'}>
								<Switch.HiddenInput />
								<Switch.Control css={{ bg: (params.multiGpu ?? false) ? '#34d399' : 'surface.4' }}>
									<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
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
											}} color="#34d399">
												<Checkbox.HiddenInput />
												<Checkbox.Control borderRadius="sm" bg={isActive ? '#34d399' : 'rgba(255, 255, 255, 0.06)'}>
													<Checkbox.Indicator><Check size={12} /></Checkbox.Indicator>
												</Checkbox.Control>
											</Checkbox.Root>
											<Box flex="1" minW="0">
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.5)" lineClamp={1}>{dev.name}</Text>
												<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">{dev.backendType} · {(dev.vramTotalMb / 1024).toFixed(1)} GB</Text>
											</Box>
											<HStack gap="1">
												<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" flexShrink={0}>GPU{idx}</Text>
												<Input type="number" value={splitVal} onChange={(e) => {
													const val = Math.max(0, Number(e.target.value));
													const values = [...(gpuSplitValues ?? devices.map(() => 0))];
													values[idx] = val;
													handleSplitChange(values);
												}} size="xs" w="60px" textAlign="right"
													bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)"
													color="rgba(255, 255, 255, 0.6)" fontFamily='"Geist Mono", monospace'
													fontSize="11px" borderRadius="md" min={0}
													_focus={{ borderColor: 'rgba(52, 211, 153, 0.4)', outline: 'none' }}
													disabled={!isActive}
												/>
											</HStack>
										</HStack>
									);
								})}
								<HStack justify="flex-end">
									<Button size="xs" variant="ghost" fontSize="10px" color="rgba(255, 255, 255, 0.3)"
										_hover={{ color: '#34d399', bg: 'rgba(52, 211, 153, 0.08)' }}
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
