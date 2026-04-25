import React, { useState, useMemo } from 'react';
import {
	Flex, Box, Text, HStack, VStack, Button, Input, Switch, Portal, Combobox, createListCollection,
} from '@chakra-ui/react';
import { Sparkles, Layers, Cpu } from 'lucide-react';
import { ESpecType, type IModel, type ISpecDecodeParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { NumberField, SelectField } from './Helpers';

type TModelEntry = {
	model: IModel;
	file: IModel['files'][number];
	label: string;
	searchText: string;
};

function formatSize(mb: number): string {
	if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
	return mb + ' MB';
}

const ModelCombobox = React.memo(({ entries, selectedPath, onSelect, placeholder }: {
	entries: TModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
	placeholder: string;
}) => {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean);
		return entries.filter(e => terms.every(term => e.searchText.includes(term)));
	}, [entries, inputValue]);
	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({ label: e.file.fileName, value: e.file.filePath, entry: e })),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	[filteredItems]);
	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => { const val = details.value?.[0]; if (val) onSelect(val); }}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedPath ? [selectedPath] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input placeholder={placeholder}
					bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
					_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content maxH="280px" overflowY="auto" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1">
						<Combobox.Empty><Text fontSize="12px" color="rgba(255, 255, 255, 0.25)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TModelEntry }).entry;
							return (
								<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }} _highlighted={{ bg: 'rgba(167, 139, 250, 0.08)' }}>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1}>{entry.file.fileName}</Text>
											<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)">{entry.model.user}</Text>
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

export const SpeculativeDecodingCard = React.memo(({
	specDecode,
	onSpecParamChange,
	targetArchitecture,
	draftModelEntries,
	selectedDraftEntry,
	deviceOptions,
	deviceIdToName,
}: {
	specDecode: ISpecDecodeParams;
	onSpecParamChange: <K extends keyof ISpecDecodeParams>(key: K, value: ISpecDecodeParams[K]) => void;
	targetArchitecture: string | null;
	draftModelEntries: TModelEntry[];
	selectedDraftEntry: TModelEntry | null;
	deviceOptions: string[];
	deviceIdToName: Record<string, string>;
}) => {
	return (
		<Card bg={specDecode.enabled ? 'rgba(167, 139, 250, 0.03)' : undefined} borderColor={specDecode.enabled ? 'rgba(167, 139, 250, 0.12)' : undefined}>
			<HStack justify="space-between" align="center">
				<HStack gap="3">
					<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
						bg={specDecode.enabled ? 'rgba(167, 139, 250, 0.15)' : 'rgba(255, 255, 255, 0.04)'}>
						<Sparkles size={14} color={specDecode.enabled ? '#a78bfa' : 'rgba(255, 255, 255, 0.3)'} />
					</Flex>
					<VStack align="start" gap="0.5">
						<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Speculative Decoding</Text>
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">{specDecode.mode === 'ngram' ? 'Draftless n-gram speculation' : 'Use a smaller model as the draft driver'}</Text>
					</VStack>
				</HStack>
				<Switch.Root label="Enable speculative decoding" checked={specDecode.enabled} onCheckedChange={(d) => onSpecParamChange('enabled', d.checked)} color={specDecode.enabled ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: specDecode.enabled ? '#a78bfa' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
					</Switch.Control>
				</Switch.Root>
			</HStack>

			{specDecode.enabled && (
				<VStack align="stretch" gap="4" mt="4">
					<HStack gap="2">
						<Button size="sm" variant="outline" flex="1" justifyContent="center"
							borderColor={specDecode.mode === 'ngram' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(167, 139, 250, 0.3)'}
							borderWidth={specDecode.mode === 'ngram' ? '1px' : '2px'}
							color={specDecode.mode === 'ngram' ? 'rgba(255, 255, 255, 0.4)' : '#a78bfa'}
							bg={specDecode.mode === 'ngram' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(167, 139, 250, 0.05)'}
							_hover={{ borderColor: specDecode.mode === 'ngram' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(167, 139, 250, 0.5)' }}
							onClick={() => onSpecParamChange('mode', 'draft')}
						><Text fontSize="13px" fontWeight="500">Draft Model</Text></Button>
						<Button size="sm" variant="outline" flex="1" justifyContent="center"
							borderColor={specDecode.mode === 'ngram' ? 'rgba(167, 139, 250, 0.3)' : 'rgba(255, 255, 255, 0.08)'}
							borderWidth={specDecode.mode === 'ngram' ? '2px' : '1px'}
							color={specDecode.mode === 'ngram' ? '#a78bfa' : 'rgba(255, 255, 255, 0.4)'}
							bg={specDecode.mode === 'ngram' ? 'rgba(167, 139, 250, 0.05)' : 'rgba(255, 255, 255, 0.02)'}
							_hover={{ borderColor: specDecode.mode === 'ngram' ? 'rgba(167, 139, 250, 0.5)' : 'rgba(255, 255, 255, 0.15)' }}
							onClick={() => onSpecParamChange('mode', 'ngram')}
						><Text fontSize="13px" fontWeight="500">Ngram</Text></Button>
					</HStack>

					{specDecode.mode !== 'ngram' && (
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="11px" color="rgba(167, 139, 250, 0.7)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Draft Model</Text>
								{!targetArchitecture ? (
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">Select a target model first to see compatible draft models.</Text>
								) : draftModelEntries.length === 0 ? (
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">No compatible draft models found. Draft models must share the same architecture ({targetArchitecture}).</Text>
								) : (
									<ModelCombobox entries={draftModelEntries} selectedPath={specDecode.draftModelPath || null}
										onSelect={(path) => onSpecParamChange('draftModelPath', path)}
										placeholder="Search compatible draft models..." />
								)}
								{selectedDraftEntry?.file.metadata && (
									<HStack mt="2" gap="4" px="3" py="2" bg="rgba(167, 139, 250, 0.04)" borderRadius="lg" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.1)">
										<HStack gap="1.5"><Layers size={12} color="rgba(167, 139, 250, 0.5)" /><Text fontSize="11px" color="rgba(167, 139, 250, 0.7)">{selectedDraftEntry.file.metadata.nLayers} layers</Text></HStack>
										<HStack gap="1.5"><Cpu size={12} color="rgba(167, 139, 250, 0.5)" /><Text fontSize="11px" color="rgba(167, 139, 250, 0.7)">{selectedDraftEntry.file.metadata.paramCount}</Text></HStack>
										<Text fontSize="11px" color="rgba(167, 139, 250, 0.5)" fontFamily='"Geist Mono", monospace'>{formatSize(selectedDraftEntry.model.totalSizeMb)}</Text>
									</HStack>
								)}
							</Box>

							{deviceOptions.length > 0 && (
								<Box>
									<SelectField label="Draft Device" value={specDecode.draftDevice} options={['', ...deviceOptions]}
										onChange={v => onSpecParamChange('draftDevice', v)} mono
										optionLabels={{ '': 'Same as target', ...deviceIdToName }} />
									<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)" mt="1">Leave empty to use target device.</Text>
								</Box>
							)}

							<Flex gap="4">
								{selectedDraftEntry?.file.metadata ? (
									<Box flex="1">
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">
											GPU Layers <Text as="span" color="rgba(255, 255, 255, 0.2)">/ {selectedDraftEntry.file.metadata.nLayers}</Text>
										</Text>
										<Input type="number" value={specDecode.draftGpuLayers} onChange={e => onSpecParamChange('draftGpuLayers', Number(e.target.value))} size="sm"
											bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
											fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
											_focus={{ borderColor: 'rgba(167, 139, 250, 0.4)', outline: 'none' }} min={0} max={selectedDraftEntry.file.metadata.nLayers}
										/>
									</Box>
								) : (
									<NumberField label="GPU Layers" value={specDecode.draftGpuLayers} onChange={v => onSpecParamChange('draftGpuLayers', v)} min={0} max={999} />
								)}
								<NumberField label="Context Size" value={specDecode.draftContextSize} onChange={v => onSpecParamChange('draftContextSize', v)} min={0} step={1024} suffix="0 = auto" />
							</Flex>

							<Box>
								<Text fontSize="11px" color="rgba(167, 139, 250, 0.7)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Accept Threshold</Text>
								<Input type="number" value={specDecode.draftPMin} onChange={e => onSpecParamChange('draftPMin', Number(e.target.value))} size="sm"
									bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)"
									fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
									_focus={{ borderColor: 'rgba(167, 139, 250, 0.4)', outline: 'none' }} min={0} max={1} step={0.05} />
								<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)" mt="1">0.0 - 1.0</Text>
							</Box>
						</VStack>
					)}

					{specDecode.mode === 'ngram' && (
						<VStack align="stretch" gap="4">
							<SelectField label="Spec Type" value={specDecode.specType ?? ESpecType.NGRAM_SIMPLE}
								options={[ESpecType.NGRAM_SIMPLE, ESpecType.NGRAM_CACHE, ESpecType.NGRAM_MAP_K, ESpecType.NGRAM_MAP_K4V, ESpecType.NGRAM_MOD]}
								onChange={v => onSpecParamChange('specType', v as ESpecType)}
								optionLabels={{
									[ESpecType.NGRAM_SIMPLE]: 'ngram-simple (fastest)', [ESpecType.NGRAM_CACHE]: 'ngram-cache (legacy)',
									[ESpecType.NGRAM_MAP_K]: 'ngram-map-k (hash map)', [ESpecType.NGRAM_MAP_K4V]: 'ngram-map-k4v (multi-value)',
									[ESpecType.NGRAM_MOD]: 'ngram-mod (best MoE/code)',
								}} />
							<Flex gap="4">
								<NumberField label="N-Gram Size (n)" value={specDecode.ngramSizeN ?? 12} onChange={v => onSpecParamChange('ngramSizeN', v)} min={1} max={64} />
								<NumberField label="M-Gram Size (m)" value={specDecode.ngramSizeM ?? 48} onChange={v => onSpecParamChange('ngramSizeM', v)} min={1} max={256} />
							</Flex>
							{(specDecode.specType === ESpecType.NGRAM_MAP_K || specDecode.specType === ESpecType.NGRAM_MAP_K4V) && (
								<NumberField label="Min Hits" value={specDecode.ngramMinHits ?? 1} onChange={v => onSpecParamChange('ngramMinHits', v)} min={1} max={32} />
							)}
						</VStack>
					)}

					<Box>
						<Text fontSize="11px" color="rgba(167, 139, 250, 0.7)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Drafting Parameters</Text>
						<Flex gap="4">
							<NumberField label="Draft Max" value={specDecode.draftMax} onChange={v => onSpecParamChange('draftMax', v)} min={1} max={128} />
							<NumberField label="Draft Min" value={specDecode.draftMin} onChange={v => onSpecParamChange('draftMin', v)} min={0} max={64} />
						</Flex>
					</Box>
				</VStack>
			)}
		</Card>
	);
});
