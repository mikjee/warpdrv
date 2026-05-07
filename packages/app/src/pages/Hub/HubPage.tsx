import React, { useState, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Badge,
} from '@chakra-ui/react';
import { Slider } from '@chakra-ui/react';
import {
	Globe, Search, ChevronDown, Package, AlertCircle, Settings,
	ArrowUpDown, Download, ArrowUpAZ, ArrowDownAZ,
	ArrowDownZA,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ISettings, IHubModel, IDownload } from '@warpcore/shared';
import { PageHeader } from '../../components/PageHeader';
import { HubModelCard } from './HubModelCard';
import { HubModelDetail } from './HubModelDetail';
import { DownloadManager } from './DownloadManager';

import { useStore } from '../../store';
import { searchHub } from '../../api/services';
import { EDownloadStatus } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';

enum EHubSortField {
	DOWNLOADS = 'downloads',
	LIKES = 'likes',
	MODIFIED = 'modified',
	CREATED = 'created',
}

enum ESortOrder {
	DESC = 'desc',
	ASC = 'asc',
}

const SORT_FIELD_OPTIONS: { value: EHubSortField; label: string }[] = [
	{ value: EHubSortField.DOWNLOADS, label: 'Downloads' },
	{ value: EHubSortField.LIKES, label: 'Likes' },
	{ value: EHubSortField.MODIFIED, label: 'Last Modified' },
	{ value: EHubSortField.CREATED, label: 'Created Date' },
];

const PARAM_STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 17, 20, 24, 27, 30, 36, 45, 90, 140, 280, 560, 1000];

export const HubPage = React.memo(() => {
	const { toast } = useToast();
	const navigate = useNavigate();
	const settings = useStore(s => s.settings);

	// Use downloads from SSE
	const downloads = Object.values(useStore((s: any) => s.downloads)) as IDownload[];
	const activeDownloadCount = downloads.filter((d: IDownload) =>
		d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.PAUSED
	).length;

	const hasModelDirs = settings.modelRoots.length > 0;

	// Search state
	const [query, setQuery] = useState('');
	const [sortField, setSortField] = useState<EHubSortField>(EHubSortField.DOWNLOADS);
	const [sortOrder, setSortOrder] = useState<ESortOrder>(ESortOrder.DESC);
	const [showSortMenu, setShowSortMenu] = useState(false);
	const [paramsRange, setParamsRange] = useState<[number, number]>([0, PARAM_STEPS.length - 1]);
	const [results, setResults] = useState<IHubModel[]>([]);
	const [searching, setSearching] = useState(false);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [searchExecuted, setSearchExecuted] = useState(false);
	const [showDownloads, setShowDownloads] = useState(false);

	const handleSearch = async () => {
		if (!query.trim()) return;
		setSearching(true);
		setSearchExecuted(true);
		const result = await searchHub(query.trim(), sortField, sortOrder, PARAM_STEPS[paramsRange[0]] || 0, PARAM_STEPS[paramsRange[1]] || 1000);
		if (result.ok) {
			setResults(result.data);
			setSelectedModelId(null);
		} else {
			toast('error', result.error ?? 'Search failed');
		}
		setSearching(false);
	};

	const handleSortFieldChange = async (newField: EHubSortField) => {
		setSortField(newField);
		if (searchExecuted && query.trim()) {
			setSearching(true);
			const apiOrder = (newField === EHubSortField.DOWNLOADS || newField === EHubSortField.LIKES)
				? 'desc'
				: sortOrder;
			const result = await searchHub(query.trim(), newField, apiOrder, PARAM_STEPS[paramsRange[0]] || 0, PARAM_STEPS[paramsRange[1]] || 1000);
			if (result.ok) {
				const needsReverse = sortOrder === 'asc'
					&& (newField === EHubSortField.DOWNLOADS || newField === EHubSortField.LIKES);
				setResults(needsReverse ? [...result.data].reverse() : result.data);
			} else {
				toast('error', result.error ?? 'Search failed');
			}
			setSearching(false);
		}
	};

	const handleSortOrderToggle = async () => {
		const newOrder: ESortOrder = sortOrder === ESortOrder.DESC ? ESortOrder.ASC : ESortOrder.DESC;
		setSortOrder(newOrder);

		if (searchExecuted && query.trim()) {
			setSearching(true);
			const apiOrder = (sortField === EHubSortField.DOWNLOADS || sortField === EHubSortField.LIKES)
				? 'desc'
				: newOrder;
			const result = await searchHub(query.trim(), sortField, apiOrder, PARAM_STEPS[paramsRange[0]] || 0, PARAM_STEPS[paramsRange[1]] || 1000);
			if (result.ok) {
				const needsReverse = newOrder === 'asc'
					&& (sortField === EHubSortField.DOWNLOADS || sortField === EHubSortField.LIKES);
				setResults(needsReverse ? [...result.data].reverse() : result.data);
			} else {
				toast('error', result.error ?? 'Search failed');
			}
			setSearching(false);
		}
	};

	// Guard — no model dirs
	if (!hasModelDirs) {
		return (
			<Box>
				<PageHeader title="Hub" subtitle="Browse and download models from HuggingFace" icon={<Globe size={20} />} />
				<Flex h="calc(100vh - 89px)" alignItems="center" justifyContent="center">
					<VStack gap="4" maxW="400px" textAlign="center">
						<Flex w="14" h="14" borderRadius="xl" alignItems="center" justifyContent="center" bg="var(--wc-accent-yellow-bg-8)" borderWidth="1px" borderColor="var(--wc-accent-yellow-border)">
							<AlertCircle size={28} color="var(--wc-accent-yellow)" />
						</Flex>
						<Text fontSize="16px" fontWeight="600" color="var(--wc-text-primary)">No model directory configured</Text>
						<Text fontSize="13px" color="var(--wc-text-muted)">
							Add a model directory in Settings first to enable downloading.
						</Text>
						<Button size="sm" bg="var(--wc-accent-blue-bg-12)" color="var(--wc-accent-blue)" borderWidth="1px" borderColor="var(--wc-accent-blue-border)" _hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }} borderRadius="lg" fontSize="13px" fontWeight="500" onClick={() => navigate('/settings')}>
							<Settings size={14} /> Go to Settings
						</Button>
					</VStack>
				</Flex>
			</Box>
		);
	}

	const selectedSortLabel = SORT_FIELD_OPTIONS.find(o => o.value === sortField)?.label ?? 'Sort';

	return (
		<Box>
			<PageHeader
				title="HuggingFace"
				icon={<Globe size={20} />}
				actions={
					<HStack gap="3">
						<Box position="relative">
							<Input
								placeholder="Search models or users..."
								size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
								color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg" pl="9"
								_placeholder={{ color: 'var(--wc-text-faint)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
								value={query} onChange={e => setQuery(e.target.value)}
								onKeyDown={e => e.key === 'Enter' && handleSearch()}
								w="200px"
							/>
							<Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="var(--wc-text-muted)">
								<Search size={14} />
							</Box>
						</Box>
						<HStack gap="3" alignItems="center">
							<Text fontSize="11px" color="var(--wc-text-faint)">Params</Text>
							<Slider.Root
								w="150px"
								size="sm"
								colorPalette="blue"
								value={paramsRange}
								min={0}
								max={PARAM_STEPS.length - 1}
								minStepsBetweenThumbs={1}
								onValueChange={(details) => setParamsRange(details.value as [number, number])}
							>
								<Slider.Control>
									<Slider.Track>
										<Slider.Range />
									</Slider.Track>
									<Slider.Thumbs />
								</Slider.Control>
							</Slider.Root>
							<Text fontSize="10px" color="var(--wc-text-tertiary)">{PARAM_STEPS[paramsRange[0]]}B - {PARAM_STEPS[paramsRange[1]]}B</Text>
						</HStack>
						<Button
							size="sm" bgGradient="to-r" gradientFrom="var(--wc-gradient-blue-from)" gradientTo="var(--wc-gradient-blue-to)"
							color="white" _hover={{ opacity: 0.9 }}
							borderRadius="lg" fontSize="13px" fontWeight="600"
							onClick={handleSearch} disabled={!query.trim() || searching} px="5"
						>
							{searching ? <Spinner size="xs" /> : <Search size={14} />}
							Search
						</Button>
					</HStack>
				}
				actionsRight={
					<Button
						size="sm" variant="outline"
						bg={activeDownloadCount > 0 ? 'var(--wc-accent-blue-bg-8)' : 'var(--wc-accent-blue-bg-12)'}
						borderColor={activeDownloadCount > 0 ? 'var(--wc-accent-blue-border)' : 'var(--wc-accent-blue-border)'}
						color={activeDownloadCount > 0 ? 'var(--wc-accent-blue)' : 'var(--wc-accent-blue)'}
						_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
						borderRadius="lg" fontSize="12px"
						onClick={() => setShowDownloads(!showDownloads)}
					>
						<Download size={14} />
						Downloads
						{activeDownloadCount > 0 && (
							<Badge px="1.5" py="0" borderRadius="full" fontSize="10px" bg="var(--wc-accent-blue-bg-10)" color="var(--wc-accent-blue)" ml="1">
								{activeDownloadCount}
							</Badge>
						)}
					</Button>
				}
			/>

			{/* Results + Detail */}
			<Flex pt="60px" h="calc(100vh - 10px)" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" overflow="hidden">
				<Box w="400px" minW="400px" borderRightWidth="1px" borderColor="var(--wc-border-subtle)" display="flex" flexDirection="column">
					{!searchExecuted ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<VStack gap="3" color="var(--wc-text-disabled)">
								<Globe size={40} />
								<Text fontSize="13px">Search HuggingFace for GGUF models</Text>
							</VStack>
						</Flex>
					) : searching ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<Spinner size="md" color="var(--wc-text-faint)" />
						</Flex>
					) : results.length === 0 ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<Text fontSize="12px" color="var(--wc-text-faint)">No results found</Text>
						</Flex>
					) : (
						<>
							<Box px="4" py="3" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
								<Flex justify="space-between" alignItems="center">
									<Text fontSize="11px" color="var(--wc-text-faint)">{results.length} results</Text>
									<HStack gap="1">
										<Box position="relative">
											<Button
												size="sm" variant="outline" bg="var(--wc-bg-subtle)"
												borderColor="var(--wc-border-default)" color="var(--wc-text-tertiary)"
												fontSize="11px" borderRadius="lg" _hover={{ borderColor: 'var(--wc-border-strong)' }}
												onClick={() => setShowSortMenu(!showSortMenu)} px="2" py="1" h="auto"
											>
												<ArrowUpDown size={11} /> {selectedSortLabel} <ChevronDown size={10} />
											</Button>
											{showSortMenu && (
												<>
													<Box position="fixed" inset="0" zIndex="dropdown" onClick={() => setShowSortMenu(false)} />
													<Box position="absolute" top="100%" right="0" mt="1" bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" zIndex="dropdown" py="1" minW="140px">
														{SORT_FIELD_OPTIONS.map(opt => (
															<Box key={opt.value} px="3" py="1.5" fontSize="11px"
																color={sortField === opt.value ? 'var(--wc-accent-blue)' : 'var(--wc-text-secondary)'}
																bg={sortField === opt.value ? 'var(--wc-accent-blue-bg-8)' : 'transparent'}
																cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }}
																onClick={() => { handleSortFieldChange(opt.value); setShowSortMenu(false); }}
															>
																{opt.label}
															</Box>
														))}
													</Box>
												</>
											)}
										</Box>
										<Button
											size="sm" variant="outline" bg="var(--wc-bg-subtle)"
											borderColor="var(--wc-border-default)" color="var(--wc-text-tertiary)"
											fontSize="11px" borderRadius="lg" _hover={{ borderColor: 'var(--wc-border-strong)' }}
											onClick={handleSortOrderToggle} px="1.5" py="1" h="auto" title={sortOrder === ESortOrder.DESC ? 'Descending' : 'Ascending'}
										>
											{sortOrder === ESortOrder.DESC ? <ArrowDownZA size={12} /> : <ArrowUpAZ size={12} />}
										</Button>
									</HStack>
								</Flex>
							</Box>
							<Box flex="1" overflowY="auto" p="4">
								<VStack align="stretch" gap="2">
									{results.map((model: IHubModel) => (
										<HubModelCard
											key={model.id} model={model}
											selected={selectedModelId === model.id}
											onClick={() => setSelectedModelId(model.id)}
										/>
									))}
								</VStack>
							</Box>
						</>
					)}
				</Box>

				<Box flex="1" overflowY="auto">
					{selectedModelId ? (
						<HubModelDetail modelId={selectedModelId} modelRoots={settings?.modelRoots ?? []} />
					) : (
						<Flex h="100%" alignItems="center" justifyContent="center">
							<VStack gap="3" color="var(--wc-text-disabled)">
								<Package size={40} />
								<Text fontSize="13px">Select a model to view details</Text>
							</VStack>
						</Flex>
					)}
				</Box>
			</Flex>

			{/* Download manager panel */}
			{showDownloads && <DownloadManager onClose={() => setShowDownloads(false)} />}
		</Box>
	);
});
