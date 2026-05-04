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
						<Flex w="14" h="14" borderRadius="xl" alignItems="center" justifyContent="center" bg="rgba(251, 191, 36, 0.08)" borderWidth="1px" borderColor="rgba(251, 191, 36, 0.15)">
							<AlertCircle size={28} color="#fbbf24" />
						</Flex>
						<Text fontSize="16px" fontWeight="600" color="#e4e4e7">No model directory configured</Text>
						<Text fontSize="13px" color="rgba(255, 255, 255, 0.4)">
							Add a model directory in Settings first to enable downloading.
						</Text>
						<Button size="sm" bg="rgba(51, 129, 255, 0.12)" color="#3381ff" borderWidth="1px" borderColor="rgba(51, 129, 255, 0.25)" _hover={{ bg: 'rgba(51, 129, 255, 0.2)' }} borderRadius="lg" fontSize="13px" fontWeight="500" onClick={() => navigate('/settings')}>
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
								size="sm" bg="var(--w-header-search-bg)" borderColor="var(--w-header-search-border)"
								color="var(--w-header-search-color)" fontSize="13px" borderRadius="lg" pl="9"
								_placeholder={{ color: 'var(--w-header-search-placeholder)' }}
								_focus={{ borderColor: 'var(--w-header-search-focus-border)', outline: 'none' }}
								value={query} onChange={e => setQuery(e.target.value)}
								onKeyDown={e => e.key === 'Enter' && handleSearch()}
								w="200px"
							/>
							<Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="var(--w-header-search-icon)">
								<Search size={14} />
							</Box>
						</Box>
						<HStack gap="3" alignItems="center">
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">Params</Text>
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
							<Text fontSize="10px" color="rgba(255, 255, 255, 0.5)">{PARAM_STEPS[paramsRange[0]]}B - {PARAM_STEPS[paramsRange[1]]}B</Text>
						</HStack>
						<Button
							size="sm" bgGradient="to-r" gradientFrom="var(--w-header-gradient-btn-from)" gradientTo="var(--w-header-gradient-btn-to)"
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
						bg={activeDownloadCount > 0 ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
						borderColor={activeDownloadCount > 0 ? 'rgba(51, 129, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)'}
						color={activeDownloadCount > 0 ? '#3381ff' : 'rgba(255, 255, 255, 0.4)'}
						_hover={{ bg: 'rgba(51, 129, 255, 0.12)' }}
						borderRadius="lg" fontSize="12px"
						onClick={() => setShowDownloads(!showDownloads)}
					>
						<Download size={14} />
						Downloads
						{activeDownloadCount > 0 && (
							<Badge px="1.5" py="0" borderRadius="full" fontSize="10px" bg="rgba(51, 129, 255, 0.2)" color="#3381ff" ml="1">
								{activeDownloadCount}
							</Badge>
						)}
					</Button>
				}
			/>

			{/* Results + Detail */}
			<Flex pt="60px" h="calc(100vh - 10px)" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" overflow="hidden">
				<Box w="400px" minW="400px" borderRightWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" display="flex" flexDirection="column">
					{!searchExecuted ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<VStack gap="3" color="rgba(255, 255, 255, 0.15)">
								<Globe size={40} />
								<Text fontSize="13px">Search HuggingFace for GGUF models</Text>
							</VStack>
						</Flex>
					) : searching ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<Spinner size="md" color="rgba(255, 255, 255, 0.2)" />
						</Flex>
					) : results.length === 0 ? (
						<Flex flex="1" alignItems="center" justifyContent="center">
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No results found</Text>
						</Flex>
					) : (
						<>
							<Box px="4" py="3" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
								<Flex justify="space-between" alignItems="center">
									<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)">{results.length} results</Text>
									<HStack gap="1">
										<Box position="relative">
											<Button
												size="sm" variant="outline" bg="rgba(255, 255, 255, 0.03)"
												borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.5)"
												fontSize="11px" borderRadius="lg" _hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
												onClick={() => setShowSortMenu(!showSortMenu)} px="2" py="1" h="auto"
											>
												<ArrowUpDown size={11} /> {selectedSortLabel} <ChevronDown size={10} />
											</Button>
											{showSortMenu && (
												<>
													<Box position="fixed" inset="0" zIndex="dropdown" onClick={() => setShowSortMenu(false)} />
													<Box position="absolute" top="100%" right="0" mt="1" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" zIndex="dropdown" py="1" minW="140px">
														{SORT_FIELD_OPTIONS.map(opt => (
															<Box key={opt.value} px="3" py="1.5" fontSize="11px"
																color={sortField === opt.value ? '#3381ff' : 'rgba(255, 255, 255, 0.6)'}
																bg={sortField === opt.value ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
																cursor="pointer" _hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
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
											size="sm" variant="outline" bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.5)"
											fontSize="11px" borderRadius="lg" _hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
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
							<VStack gap="3" color="rgba(255, 255, 255, 0.15)">
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
