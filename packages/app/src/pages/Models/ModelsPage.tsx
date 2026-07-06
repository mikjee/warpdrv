import { Box, Text, HStack, Flex, Badge, Button, Spinner, Input } from '@chakra-ui/react';
import {
	FolderOpen, Search, MoreVertical, ExternalLink, Eye, RefreshCw,
	FolderOpen as FolderIcon, Trash2, ChevronUp, ChevronDown, Mic,
} from 'lucide-react';
import { BsFillChatLeftTextFill } from 'react-icons/bs';
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { scanModels, scanWhisperModels, reparseModel } from '../../api/services';
import { openExternal } from '../../utils/openExternal';
import type { IModel, IWhisperModel } from '@warpcore/shared';

// ============================================================
// Helpers
// ============================================================

import { QUANT_COLORS } from '@/lib/constants';

type TModelType = 'llama' | 'whisper';

interface IDisplayModel extends IModel {
	_modelType: TModelType;
}

// Normalize a whisper model to display shape
function normalizeWhisper(m: IWhisperModel): IDisplayModel {
	const meta = m.primaryFile?.metadata;
	return {
		id: m.id,
		user: m.user,
		name: m.name,
		dirPath: m.dirPath,
		_modelType: 'whisper',
		files: m.files.map(f => ({
			...f,
			shardIndex: null,
			shardTotal: null,
			isMmproj: false,
			parentModel: null,
		}) as any),
		primaryFile: m.primaryFile ? ({
			...m.primaryFile,
			shardIndex: null,
			shardTotal: null,
			isMmproj: false,
			parentModel: null,
			metadata: {
				quantType: meta?.ftype ?? '-',
				architecture: `whisper (${meta?.modelSize ?? 'unknown'})`,
				paramCount: meta?.modelSize ?? '-',
				contextLength: meta?.contextLength ?? 0,
			},
		} as any) : null,
		mmprojFile: null,
		totalSizeMb: m.totalSizeMb,
	};
}

function tagLlama(m: IModel): IDisplayModel {
	return { ...m, _modelType: 'llama' };
}

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

type TSortKey = 'type' | 'name' | 'user' | 'quant' | 'params' | 'size' | 'context' | 'files' | 'vision';

interface ISortState {
	key: TSortKey;
	desc: boolean;
}

function getSortValue(model: IDisplayModel, key: TSortKey): string | number {
	const meta = model.primaryFile?.metadata;
	switch (key) {
		case 'type': return model._modelType === 'llama' ? 0 : 1;
		case 'name': return model.name.toLowerCase();
		case 'user': return model.user.toLowerCase();
		case 'quant': return meta?.quantType?.toLowerCase() ?? '';
		case 'params': {
			const raw = meta?.paramCount ?? '';
			const match = raw.match(/([\d.]+)/);
			return match ? parseFloat(match[1]!) : 0;
		}
		case 'size': return model.totalSizeMb;
		case 'context': return meta?.contextLength ?? 0;
		case 'files': return model.files.length;
		case 'vision': return model.mmprojFile ? 1 : 0;
	}
}

function sortModels(models: IDisplayModel[], sort: ISortState): IDisplayModel[] {
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

function RowMenu({ model, onClose, onReparse }: { model: IDisplayModel; onClose: () => void; onReparse: (id: string) => void }) {
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
			bg="var(--wc-bg-dialog)"
			borderWidth="1px"
			borderColor="var(--wc-border-default)"
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
				color="var(--wc-text-secondary)"
				_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-heading)' }}
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
				color="var(--wc-text-secondary)"
				_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-heading)' }}
				transition="all 0.1s ease"
				onClick={() => {
					navigator.clipboard.writeText(model.dirPath);
					onClose();
				}}
			>
				<FolderIcon size={14} />
				<Text fontSize="12px">Copy folder path</Text>
			</HStack>
			{model._modelType === 'llama' && (
				<HStack
					gap="2"
					px="3"
					py="2"
					cursor="pointer"
					color="var(--wc-text-secondary)"
					_hover={{ bg: 'var(--wc-bg-card)', color: 'var(--wc-text-heading)' }}
					transition="all 0.1s ease"
					onClick={() => {
						onReparse(model.id);
						onClose();
					}}
				>
					<RefreshCw size={14} />
					<Text fontSize="12px">Re-parse Metadata</Text>
				</HStack>
			)}
			<Box h="1px" bg="var(--wc-border-subtle)" my="1" />
			<	HStack
				gap="2"
				px="3"
				py="2"
				cursor="not-allowed"
				color="var(--wc-text-disabled)"
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
			color={isActive ? 'var(--wc-text-secondary)' : 'var(--wc-text-muted)'}
			_hover={{ color: 'var(--wc-text-secondary)' }}
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
	const whisperModelsRecord = useStore(s => s.whisperModels);
	const allModels: IDisplayModel[] = useMemo(() => [
		...Object.values(modelsRecord).map(tagLlama),
		...Object.values(whisperModelsRecord || {}).map(normalizeWhisper),
	], [modelsRecord, whisperModelsRecord]);
	const scanMut = useMutation<void, IModel[]>(
		useCallback(() => scanModels() as Promise<any>, [])
	);
	const scanWhisperMut = useMutation<void, any[]>(
		useCallback(() => scanWhisperModels() as Promise<any>, [])
	);
	const reparseMut = useMutation<string, IModel>(
		useCallback((id: string) => reparseModel(id) as Promise<any>, [])
	);

const [search, setSearch] = useState('');
	const [sort, setSort] = useState<ISortState>({ key: 'type', desc: false });
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const getMenuKey = (m: IDisplayModel) => `${m.id}-${m._modelType}`;

	const handleSort = useCallback((key: TSortKey) => {
		setSort(prev => prev.key === key ? { key, desc: !prev.desc } : { key, desc: false });
	}, []);

	const handleScan = async () => {
		await Promise.all([
			scanMut.mutate(undefined as any),
			scanWhisperMut.mutate(undefined as any),
		]);
	};

	const filtered = useMemo(() => {
		const q = search.toLowerCase().trim();
		let result = allModels;
		if (q) {
			result = result.filter(m =>
				m.name.toLowerCase().includes(q)
				|| m.user.toLowerCase().includes(q)
				|| (m.primaryFile?.metadata?.quantType?.toLowerCase().includes(q))
				|| (m.primaryFile?.metadata?.paramCount?.toLowerCase().includes(q))
				|| (m.primaryFile?.metadata?.architecture?.toLowerCase().includes(q))
			);
		}
		return sortModels(result, sort);
	}, [allModels, search, sort]);

	// Column widths
	const cols = {
		type: '50px',
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
				subtitle={`${allModels.length} model${allModels.length !== 1 ? 's' : ''}`}
				icon={<FolderOpen size={20} />}
				actions={
					<HStack gap="3">
						<Box position="relative">
							<Search
								size={14}
								style={{
									position: 'absolute',
									left: '10px',
									top: '50%',
									transform: 'translateY(-50%)',
									color: 'var(--wc-text-muted)',
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
								bg="var(--wc-bg-card)"
								borderColor="var(--wc-border-default)"
								borderRadius="lg"
								fontSize="13px"
								color="var(--wc-text-primary)"
								_placeholder={{ color: 'var(--wc-text-faint)' }}
								_hover={{ borderColor: 'var(--wc-border-hover)' }}
								_focus={{ borderColor: 'var(--wc-accent-blue-focus)', boxShadow: 'none' }}
							/>
						</Box>
					</HStack>
				}
				actionsRight={
					<Button
						size="sm"
						bg="var(--wc-accent-blue-bg-12)"
						color="var(--wc-accent-blue)"
						borderWidth="1px"
						borderColor="var(--wc-accent-blue-border)"
						_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
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

			<Box pt="75px" px="3" pb="3">
				{/* Table header */}
				<Flex
					px="4"
					py="2.5"
					gap="4"
					borderBottomWidth="1px"
					borderColor="var(--wc-border-subtle)"
				>
					<Box w={cols.type}><SortHeader label="Type" sortKey="type" sort={sort} onSort={handleSort} /></Box>
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
				{allModels.length === 0 && (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Text fontSize="13px" color="var(--wc-text-faint)">
							No models found. Configure a directory in Settings, then scan.
						</Text>
					</Flex>
				)}

				{/* No results */}
				{allModels.length > 0 && filtered.length === 0 && (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Text fontSize="13px" color="var(--wc-text-faint)">
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
								key={model.id + '-' + model._modelType}
								px="4"
								py="3"
								gap="4"
								alignItems="center"
								borderBottomWidth="1px"
borderColor="var(--wc-border-subtle)"
				_hover={{ bg: 'var(--wc-bg-surface)' }}
								transition="background 0.1s ease"
							>
								{/* Type */}
								<Box w={cols.type} display="flex" justifyContent="center">
									{model._modelType === 'llama'
										? <BsFillChatLeftTextFill style={{ fontSize: 16, color: 'var(--wc-accent-blue)' }} />
										: <Mic size={16} color="var(--wc-accent-green)" />
									}
								</Box>

								{/* Model name */}
								<Box flex={cols.name} overflow="hidden">
									<Text
										fontSize="14px"
										fontWeight="500"
										color="var(--wc-text-primary)"
										lineClamp={1}
									>
										{model.name}
									</Text>
									{meta?.architecture && (
										<Text fontSize="11px" color="var(--wc-text-muted)" mt="0.5">
											{meta.architecture}
										</Text>
									)}
								</Box>

								{/* User */}
								<Box w={cols.user}>
									<Text fontSize="12px" color="var(--wc-text-muted)" lineClamp={1}>
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
									{model.mmprojFile && <Eye size={16} color="var(--wc-accent-yellow)" />}
								</Box>

								{/* Params */}
								<Box w={cols.params}>
									<Text fontSize="12px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>
										{meta?.paramCount ?? '-'}
									</Text>
								</Box>

								{/* Size */}
								<Box w={cols.size} textAlign="right">
									<Text fontSize="12px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>
										{formatSize(model.totalSizeMb)}
									</Text>
								</Box>

								{/* Context */}
								<Box w={cols.context} textAlign="right">
									<Text fontSize="12px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>
										{formatContext(meta?.contextLength ?? 0)}
									</Text>
								</Box>

								{/* Files */}
								<Box w={cols.files} textAlign="right">
									<Text fontSize="12px" color="var(--wc-text-faint)">
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
										color="var(--wc-text-faint)"
										_hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-card)' }}
										transition="all 0.1s ease"
										onClick={() => setOpenMenuId(openMenuId === getMenuKey(model) ? null : getMenuKey(model))}
									>
										<MoreVertical size={14} />
									</Flex>
									{openMenuId === getMenuKey(model) && (
										<RowMenu model={model} onClose={() => setOpenMenuId(null)} onReparse={(id) => reparseMut.mutate(id)} />
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