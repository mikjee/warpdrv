import { Box, Text, HStack, Flex, Badge, Button, Spinner, Input } from '@chakra-ui/react';
import {
	FolderOpen, Search, MoreVertical, ExternalLink, Eye,
	FolderOpen as FolderIcon, Trash2, ChevronUp, ChevronDown,
} from 'lucide-react';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { scanModels } from '../../api/services';
import { openExternal } from '../../utils/openExternal';
import type { IModel } from '@warpcore/shared';

// ============================================================
// Helpers
// ============================================================

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q5_K_M: '#34d399', Q5_K_S: '#34d399', Q4_K_S: '#34d399', Q3_K_M: '#fbbf24',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24', IQ3_XS: '#fbbf24',
	IQ4_XS: '#fbbf24', MXFP4: '#a78bfa', NVFP4: '#a78bfa',
	F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)', F16: 'rgba(255, 255, 255, 0.4)',
};

function formatSize(mb: number): string {
	if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
	return mb + ' MB';
}

function formatContext(ctx: number): string {
	if (ctx <= 0) return '-';
	if (ctx >= 1024) return (ctx / 1024).toFixed(0) + 'k';
	return String(ctx);
}

// ============================================================
// Sort
// ============================================================

type TSortKey = 'name' | 'user' | 'quant' | 'params' | 'size' | 'context' | 'files' | 'vision';

interface ISortState {
	key: TSortKey;
	desc: boolean;
}

function getSortValue(model: IModel, key: TSortKey): string | number {
	const meta = model.primaryFile?.metadata;
	switch (key) {
		case 'name': return model.name.toLowerCase();
		case 'user': return model.user.toLowerCase();
		case 'quant': return meta?.quantType?.toLowerCase() ?? '';
		case 'params': return meta?.paramCount?.toLowerCase() ?? '';
		case 'size': return model.totalSizeMb;
		case 'context': return meta?.contextLength ?? 0;
		case 'files': return model.files.length;
		case 'vision': return model.mmprojFile ? 1 : 0;
	}
}

function sortModels(models: IModel[], sort: ISortState): IModel[] {
	return [...models].sort((a, b) => {
		const aVal = getSortValue(a, sort.key);
		const bVal = getSortValue(b, sort.key);
		if (aVal < bVal) return sort.desc ? 1 : -1;
		if (aVal > bVal) return sort.desc ? -1 : 1;
		return 0;
	});
}

// ============================================================
// Row Menu
// ============================================================

function RowMenu({ model, onClose }: { model: IModel; onClose: () => void }) {
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
		}
		document.addEventListener('mousedown', handleClick);
		return () => document.removeEventListener('mousedown', handleClick);
	}, [onClose]);

	const hfUrl = `https://huggingface.co/${model.user}/${model.name}`;

	return (
		<Box
			ref={menuRef}
			position="absolute"
			right="0"
			top="100%"
			mt="1"
			zIndex={50}
			bg="#1a1a1f"
			borderWidth="1px"
			borderColor="rgba(255, 255, 255, 0.08)"
			borderRadius="lg"
			py="1"
			minW="180px"
			boxShadow="0 8px 24px rgba(0, 0, 0, 0.4)"
		>
			<HStack
				gap="2"
				px="3"
				py="2"
				cursor="pointer"
				color="rgba(255, 255, 255, 0.6)"
				_hover={{ bg: 'rgba(255, 255, 255, 0.04)', color: 'rgba(255, 255, 255, 0.9)' }}
				transition="all 0.1s ease"
				onClick={() => {
					openExternal(hfUrl);
					onClose();
				}}
			>
				<ExternalLink size={14} />
				<Text fontSize="12px">Open on HuggingFace</Text>
			</HStack>
			<HStack
				gap="2"
				px="3"
				py="2"
				cursor="pointer"
				color="rgba(255, 255, 255, 0.6)"
				_hover={{ bg: 'rgba(255, 255, 255, 0.04)', color: 'rgba(255, 255, 255, 0.9)' }}
				transition="all 0.1s ease"
				onClick={() => {
					navigator.clipboard.writeText(model.dirPath);
					onClose();
				}}
			>
				<FolderIcon size={14} />
				<Text fontSize="12px">Copy folder path</Text>
			</HStack>
			<Box h="1px" bg="rgba(255, 255, 255, 0.06)" my="1" />
			<HStack
				gap="2"
				px="3"
				py="2"
				cursor="not-allowed"
				color="rgba(255, 255, 255, 0.2)"
			>
				<Trash2 size={14} />
				<Text fontSize="12px">Delete</Text>
			</HStack>
		</Box>
	);
}

// ============================================================
// Sortable Header
// ============================================================

function SortHeader({
	label,
	sortKey,
	sort,
	onSort,
	align,
}: {
	label: string;
	sortKey: TSortKey;
	sort: ISortState;
	onSort: (key: TSortKey) => void;
	align?: 'left' | 'right';
}) {
	const isActive = sort.key === sortKey;
	return (
		<HStack
			gap="1"
			cursor="pointer"
			color={isActive ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.35)'}
			_hover={{ color: 'rgba(255, 255, 255, 0.6)' }}
			transition="color 0.1s ease"
			onClick={() => onSort(sortKey)}
			userSelect="none"
			justifyContent={align === 'right' ? 'flex-end' : 'flex-start'}
		>
			<Text fontSize="11px" fontWeight="600" textTransform="uppercase" letterSpacing="0.04em">
				{label}
			</Text>
			{isActive && (
				sort.desc ? <ChevronDown size={12} /> : <ChevronUp size={12} />
			)}
		</HStack>
	);
}

// ============================================================
// Page
// ============================================================

export function ModelsPage() {
	const modelsRecord = useStore(s => s.models);
	const models = useMemo(() => Object.values(modelsRecord), [modelsRecord]);
	const scanMut = useMutation<void, IModel[]>(
		useCallback(() => scanModels() as Promise<any>, [])
	);

	const [search, setSearch] = useState('');
	const [sort, setSort] = useState<ISortState>({ key: 'name', desc: false });
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);

	const handleSort = useCallback((key: TSortKey) => {
		setSort(prev => prev.key === key ? { key, desc: !prev.desc } : { key, desc: false });
	}, []);

	const handleScan = async () => {
		await scanMut.mutate(undefined as any);
	};

	const filtered = useMemo(() => {
		const q = search.toLowerCase().trim();
		let result = models;
		if (q) {
			result = models.filter(m =>
				m.name.toLowerCase().includes(q)
				|| m.user.toLowerCase().includes(q)
				|| (m.primaryFile?.metadata?.quantType?.toLowerCase().includes(q))
				|| (m.primaryFile?.metadata?.paramCount?.toLowerCase().includes(q))
				|| (m.primaryFile?.metadata?.architecture?.toLowerCase().includes(q))
			);
		}
		return sortModels(result, sort);
	}, [models, search, sort]);

	// Column widths
	const cols = {
		name: '1',      // flex
		user: '140px',
		quant: '90px',
		params: '60px',
		size: '80px',
		context: '70px',
		files: '50px',
		vision: '50px',
		actions: '40px',
	};

	return (
		<Box>
<PageHeader
				title="Models"
				subtitle={`${models.length} LLMs`}
				icon={<FolderOpen size={20} />}
				actions={
					<Box position="relative">
						<Search
							size={14}
							style={{
								position: 'absolute',
								left: '10px',
								top: '50%',
								transform: 'translateY(-50%)',
								color: 'rgba(255, 255, 255, 0.25)',
								pointerEvents: 'none',
							}}
						/>
						<Input
							placeholder="Search models..."
							value={search}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
							size="sm"
							pl="8"
							w="220px"
							bg="rgba(255, 255, 255, 0.03)"
							borderColor="rgba(255, 255, 255, 0.08)"
							borderRadius="lg"
							fontSize="13px"
							color="#e4e4e7"
							_placeholder={{ color: 'rgba(255, 255, 255, 0.25)' }}
							_hover={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}
							_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', boxShadow: 'none' }}
						/>
					</Box>
				}
				actionsRight={
					<Button
						size="sm"
						bg="rgba(51, 129, 255, 0.12)"
						color="#3381ff"
						borderWidth="1px"
						borderColor="rgba(51, 129, 255, 0.25)"
						_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="500"
						onClick={handleScan}
						disabled={scanMut.loading}
					>
						{scanMut.loading ? <Spinner size="xs" /> : <Search size={15} />}
						Re-Scan Folders
					</Button>
				}
			/>

			<Box p="3">
				{/* Table header */}
				<Flex
					px="4"
					py="2.5"
					gap="4"
					borderBottomWidth="1px"
					borderColor="rgba(255, 255, 255, 0.06)"
				>
					<Box flex={cols.name}><SortHeader label="Model" sortKey="name" sort={sort} onSort={handleSort} /></Box>
					<Box w={cols.user}><SortHeader label="User" sortKey="user" sort={sort} onSort={handleSort} /></Box>
<Box w={cols.quant}><SortHeader label="Quant" sortKey="quant" sort={sort} onSort={handleSort} /></Box>
				<Box w={cols.vision}><SortHeader label="Vision" sortKey="vision" sort={sort} onSort={handleSort} /></Box>
				<Box w={cols.params}><SortHeader label="Params" sortKey="params" sort={sort} onSort={handleSort} /></Box>
					<Box w={cols.size}><SortHeader label="Size" sortKey="size" sort={sort} onSort={handleSort} align="right" /></Box>
					<Box w={cols.context}><SortHeader label="Context" sortKey="context" sort={sort} onSort={handleSort} align="right" /></Box>
					<Box w={cols.files}><SortHeader label="Files" sortKey="files" sort={sort} onSort={handleSort} align="right" /></Box>
					<Box w={cols.actions} />
				</Flex>

				{/* Empty state */}
				{models.length === 0 && (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">
							No models found. Configure a directory in Settings, then scan.
						</Text>
					</Flex>
				)}

				{/* No results */}
				{models.length > 0 && filtered.length === 0 && (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">
							No models match "{search}"
						</Text>
					</Flex>
				)}

				{/* Rows */}
				<Box>
					{filtered.map(model => {
						const meta = model.primaryFile?.metadata;
						const quantType = meta?.quantType ?? '-';
						const quantColor = QUANT_COLORS[quantType] ?? 'rgba(255, 255, 255, 0.4)';

						return (
							<Flex
								key={model.id}
								px="4"
								py="3"
								gap="4"
								alignItems="center"
								borderBottomWidth="1px"
								borderColor="rgba(255, 255, 255, 0.03)"
								_hover={{ bg: 'rgba(255, 255, 255, 0.02)' }}
								transition="background 0.1s ease"
							>
								{/* Model name */}
								<Box flex={cols.name} overflow="hidden">
									<Text
										fontSize="14px"
										fontWeight="500"
										color="#e4e4e7"
										lineClamp={1}
									>
										{model.name}
									</Text>
									{meta?.architecture && (
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" mt="0.5">
											{meta.architecture}
										</Text>
									)}
								</Box>

								{/* User */}
								<Box w={cols.user}>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" lineClamp={1}>
										{model.user}
									</Text>
								</Box>

								{/* Quant */}
								<Box w={cols.quant}>
									<Badge
										px="1.5"
										py="0.5"
										borderRadius="md"
										fontSize="10px"
										fontWeight="600"
										bg={`color-mix(in srgb, ${quantColor} 12%, transparent)`}
										color={quantColor}
										borderWidth="1px"
										borderColor={`color-mix(in srgb, ${quantColor} 20%, transparent)`}
									>
										{quantType}
									</Badge>
								</Box>

								{/* Vision */}
								<Box w={cols.vision} display="flex" justifyContent="center">
									{model.mmprojFile && <Eye size={16} color="#fbbf24" />}
								</Box>

								{/* Params */}
								<Box w={cols.params}>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" fontFamily='"Geist Mono", monospace'>
										{meta?.paramCount ?? '-'}
									</Text>
								</Box>

								{/* Size */}
								<Box w={cols.size} textAlign="right">
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
										{formatSize(model.totalSizeMb)}
									</Text>
								</Box>

								{/* Context */}
								<Box w={cols.context} textAlign="right">
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>
										{formatContext(meta?.contextLength ?? 0)}
									</Text>
								</Box>

								{/* Files */}
								<Box w={cols.files} textAlign="right">
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">
										{model.files.length}
									</Text>
								</Box>

								{/* Actions */}
								<Box w={cols.actions} position="relative">
									<Flex
										as="button"
										w="28px"
										h="28px"
										alignItems="center"
										justifyContent="center"
										borderRadius="md"
										cursor="pointer"
										color="rgba(255, 255, 255, 0.25)"
										_hover={{ color: 'rgba(255, 255, 255, 0.6)', bg: 'rgba(255, 255, 255, 0.04)' }}
										transition="all 0.1s ease"
										onClick={() => setOpenMenuId(openMenuId === model.id ? null : model.id)}
									>
										<MoreVertical size={14} />
									</Flex>
									{openMenuId === model.id && (
										<RowMenu model={model} onClose={() => setOpenMenuId(null)} />
									)}
								</Box>
							</Flex>
						);
					})}
				</Box>
			</Box>
		</Box>
	);
}