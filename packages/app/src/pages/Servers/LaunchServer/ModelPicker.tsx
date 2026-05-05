import React, { useState, useMemo } from 'react';
import { Box, Text, HStack, Badge, Portal, Combobox, createListCollection } from '@chakra-ui/react';
import { Layers, Cpu, Package } from 'lucide-react';
import { type IModel } from '@warpcore/shared';
import { QUANT_COLORS } from '@/pages/Servers/utils';

export type TModelEntry = {
	model: IModel;
	file: IModel['files'][number];
	label: string;
	searchText: string;
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

const ModelCombobox = React.memo(({ entries, selectedPath, onSelect }: {
	entries: TModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
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
					placeholder="Search models..."
					bg="var(--wc-bg-subtle)"
					borderColor="var(--wc-border-default)"
					color="var(--wc-text-secondary)"
					fontSize="13px"
					borderRadius="lg"
					_placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }}
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
						bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty>
							<Text fontSize="12px" color="var(--wc-text-disabled)" py="4" textAlign="center">No matches</Text>
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
									_hover={{ bg: 'var(--wc-bg-hover)' }}
									_highlighted={{ bg: 'var(--wc-bg-card)' }}
								>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)" lineClamp={1}>{getModelDisplayName(entry.model.name, entry.file)}</Text>
										<Text fontSize="10px" color="var(--wc-text-tertiary)" mt="0.5">{entry.model.user}</Text>
										</Box>
										<HStack gap="2" flexShrink={0}>
											<Badge px="1.5" py="0" borderRadius="sm" fontSize="10px" fontWeight="600" bg={`color-mix(in srgb, ${quantColor} 12%, transparent)`} color={quantColor}>{qt}</Badge>
											<Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>{formatSize(entry.model.totalSizeMb)}</Text>
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

export const ModelPicker = React.memo(({
	modelCount,
	modelEntries,
	selectedModelPath,
	onSelectModel,
	selectedEntry,
}: {
	modelCount: number;
	modelEntries: TModelEntry[];
	selectedModelPath: string | null;
	onSelectModel: (path: string) => void;
	selectedEntry: TModelEntry | null;
}) => {
	return (
		<Box>
			<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Model</Text>
			{modelCount === 0 ? (
				<Text fontSize="12px" color="var(--wc-text-muted)">No models scanned. Go to Settings and scan.</Text>
			) : (
				<ModelCombobox entries={modelEntries} selectedPath={selectedModelPath} onSelect={onSelectModel} />
			)}
			{selectedEntry?.file.metadata && (
				<HStack mt="2" gap="4" px="3" py="2" bg="var(--wc-accent-blue-bg-8)" borderRadius="lg" borderWidth="1px" borderColor="var(--wc-accent-blue-border)">
					<HStack gap="1.5"><Layers size={12} color="var(--wc-text-muted)" /><Text fontSize="11px" color="var(--wc-text-tertiary)">{selectedEntry.file.metadata.nLayers} layers</Text></HStack>
					<HStack gap="1.5"><Cpu size={12} color="var(--wc-text-muted)" /><Text fontSize="11px" color="var(--wc-text-tertiary)">{selectedEntry.file.metadata.paramCount}</Text></HStack>
					<HStack gap="1.5"><Package size={12} color="var(--wc-text-muted)" /><Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>{formatSize(selectedEntry.model.totalSizeMb)}</Text></HStack>
					{selectedEntry.file.metadata.contextLength > 0 && (
						<HStack gap="1.5"><Text fontSize="11px" color="var(--wc-text-muted)">{(selectedEntry.file.metadata.contextLength / 1024).toFixed(0)}k ctx</Text></HStack>
					)}
					{selectedEntry.model.mmprojFile && (
						<HStack gap="1.5"><Package size={12} color="var(--wc-accent-purple)" /><Text fontSize="11px" color="var(--wc-accent-purple)">mmproj</Text></HStack>
					)}
				</HStack>
			)}
		</Box>
	);
});
