import { useState, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Badge,
} from '@chakra-ui/react';
import {
	Globe, Search, ChevronDown, Package, AlertCircle, Settings,
	ArrowUpDown, Download,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ISettings, IHubModel } from '@warpcore/shared';
import { PageHeader } from '../components/PageHeader';
import { HubModelCard } from '../components/hub/HubModelCard';
import { HubModelDetail } from '../components/hub/HubModelDetail';
import { DownloadManager } from '../components/hub/DownloadManager';
import { useQuery, useListQuery } from '../hooks/useQuery';
import { fetchSettings, fetchDownloads, searchHub } from '../api/services';
import type { IDownload } from '@warpcore/shared';
import { EDownloadStatus } from '@warpcore/shared';
import { useToast } from '../components/ToastProvider';

enum EHubSort {
	DOWNLOADS = 'downloads',
	LIKES = 'likes',
	MODIFIED = 'modified',
	CREATED = 'created',
}

const SORT_OPTIONS: { value: EHubSort; label: string }[] = [
	{ value: EHubSort.DOWNLOADS, label: 'Most Downloads' },
	{ value: EHubSort.LIKES, label: 'Most Likes' },
	{ value: EHubSort.MODIFIED, label: 'Recently Updated' },
	{ value: EHubSort.CREATED, label: 'Recently Created' },
];

export function HubPage() {
	const { toast } = useToast();
	const navigate = useNavigate();

	const settingsFetcher = useCallback(() => fetchSettings(), []);
	const { data: settings, loading: settingsLoading } = useQuery<ISettings>(settingsFetcher);

	// Poll downloads for badge count
	const dlFetcher = useCallback(() => fetchDownloads(), []);
	const { data: allDownloads } = useListQuery<IDownload>(dlFetcher, { pollInterval: 3000 });
	const activeDownloadCount = allDownloads.filter((d: IDownload) =>
		d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.PAUSED
	).length;

	const hasModelDirs = (settings?.modelRoots?.length ?? 0) > 0;

	// Search state
	const [query, setQuery] = useState('');
	const [sort, setSort] = useState<EHubSort>(EHubSort.DOWNLOADS);
	const [showSortMenu, setShowSortMenu] = useState(false);
	const [paramsMin, setParamsMin] = useState(0);
	const [paramsMax, setParamsMax] = useState(0);
	const [results, setResults] = useState<IHubModel[]>([]);
	const [searching, setSearching] = useState(false);
	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const [searchExecuted, setSearchExecuted] = useState(false);
	const [showDownloads, setShowDownloads] = useState(false);

	const handleSearch = async () => {
		if (!query.trim()) return;
		setSearching(true);
		setSearchExecuted(true);
		const result = await searchHub(query.trim(), sort, paramsMin, paramsMax);
		if (result.ok) {
			setResults(result.data);
			setSelectedModelId(null);
		} else {
			toast('error', result.error ?? 'Search failed');
		}
		setSearching(false);
	};

	// Guard — no model dirs
	if (!settingsLoading && !hasModelDirs) {
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

	const selectedSortLabel = SORT_OPTIONS.find(o => o.value === sort)?.label ?? 'Sort';

	return (
		<Box>
			<PageHeader
				title="Hub"
				subtitle="Browse and download models from HuggingFace"
				icon={<Globe size={20} />}
				actions={
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

			{/* Search bar */}
			<Flex
				px="8" py="4" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
				bg="rgba(255, 255, 255, 0.01)" gap="3" align="center" flexWrap="wrap"
			>
				<HStack flex="1" minW="280px" gap="2">
					<Box position="relative" flex="1">
						<Input
							placeholder="Search models or users..."
							size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)"
							color="rgba(255, 255, 255, 0.7)" fontSize="13px" borderRadius="lg" pl="9"
							_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
							_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
							value={query} onChange={e => setQuery(e.target.value)}
							onKeyDown={e => e.key === 'Enter' && handleSearch()}
						/>
						<Box position="absolute" left="3" top="50%" transform="translateY(-50%)" color="rgba(255, 255, 255, 0.25)">
							<Search size={14} />
						</Box>
					</Box>
					<Button
						size="sm" bgGradient="to-r" gradientFrom="#3381ff" gradientTo="#5b6af5"
						color="white" _hover={{ opacity: 0.9 }}
						borderRadius="lg" fontSize="13px" fontWeight="600"
						onClick={handleSearch} disabled={!query.trim() || searching} px="5"
					>
						{searching ? <Spinner size="xs" /> : <Search size={14} />}
						Search
					</Button>
				</HStack>

				{/* Sort */}
				<Box position="relative">
					<Button
						size="sm" variant="outline" bg="rgba(255, 255, 255, 0.03)"
						borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.5)"
						fontSize="12px" borderRadius="lg" _hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
						onClick={() => setShowSortMenu(!showSortMenu)}
					>
						<ArrowUpDown size={13} /> {selectedSortLabel} <ChevronDown size={12} />
					</Button>
					{showSortMenu && (
						<>
							<Box position="fixed" inset="0" zIndex="dropdown" onClick={() => setShowSortMenu(false)} />
							<Box position="absolute" top="100%" right="0" mt="1" bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)" borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" zIndex="dropdown" py="1" minW="160px">
								{SORT_OPTIONS.map(opt => (
									<Box key={opt.value} px="3" py="1.5" fontSize="12px"
										color={sort === opt.value ? '#3381ff' : 'rgba(255, 255, 255, 0.6)'}
										bg={sort === opt.value ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
										cursor="pointer" _hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
										onClick={() => { setSort(opt.value); setShowSortMenu(false); }}
									>
										{opt.label}
									</Box>
								))}
							</Box>
						</>
					)}
				</Box>

				{/* Param range */}
				<HStack gap="1.5">
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">Params</Text>
					<Input type="number" placeholder="Min" size="sm" w="65px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.6)" fontSize="11px" borderRadius="md" textAlign="center" _placeholder={{ color: 'rgba(255, 255, 255, 0.15)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={paramsMin || ''} onChange={e => setParamsMin(Number(e.target.value))} />
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.2)">-</Text>
					<Input type="number" placeholder="Max" size="sm" w="65px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.6)" fontSize="11px" borderRadius="md" textAlign="center" _placeholder={{ color: 'rgba(255, 255, 255, 0.15)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={paramsMax || ''} onChange={e => setParamsMax(Number(e.target.value))} />
					<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">B</Text>
				</HStack>
			</Flex>

			{/* Results + Detail */}
			<Flex h="calc(100vh - 153px)">
				<Box w="400px" minW="400px" borderRightWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" overflowY="auto" p="4">
					{!searchExecuted ? (
						<Flex h="100%" alignItems="center" justifyContent="center">
							<VStack gap="3" color="rgba(255, 255, 255, 0.15)">
								<Globe size={40} />
								<Text fontSize="13px">Search HuggingFace for GGUF models</Text>
							</VStack>
						</Flex>
					) : searching ? (
						<Flex h="200px" alignItems="center" justifyContent="center">
							<Spinner size="md" color="rgba(255, 255, 255, 0.2)" />
						</Flex>
					) : results.length === 0 ? (
						<Flex h="200px" alignItems="center" justifyContent="center">
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No results found</Text>
						</Flex>
					) : (
						<VStack align="stretch" gap="2">
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" mb="1">{results.length} results</Text>
							{results.map((model: IHubModel) => (
								<HubModelCard
									key={model.id} model={model}
									selected={selectedModelId === model.id}
									onClick={() => setSelectedModelId(model.id)}
								/>
							))}
						</VStack>
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
}
