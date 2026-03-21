import { useState, useEffect, useCallback } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Badge, Button, Spinner,
} from '@chakra-ui/react';
import {
	Download, Heart, Clock, Calendar, Tag, CheckCircle,
	ArrowDownToLine, FileText, Layers,
} from 'lucide-react';
import type { IHubModelDetail, IHubFile } from '@warpcore/shared';
import { Card } from '../Card';
import { DirPickerPopover } from './DirPickerPopover';
import { fetchHubModel, startHubDownload } from '../../api/services';
import { useToast } from '../ToastProvider';

function formatBytes(bytes: number): string {
	if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
	if (bytes >= 1048576) return (bytes / 1048576).toFixed(0) + ' MB';
	if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
	return bytes + ' B';
}

function formatDate(dateStr: string): string {
	if (!dateStr) return '';
	return new Date(dateStr).toLocaleDateString('en-US', {
		year: 'numeric', month: 'short', day: 'numeric',
	});
}

function formatCount(n: number): string {
	if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
	if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
	return String(n);
}

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399', Q6_K_L: '#34d399',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24', IQ3_XS: '#fbbf24', IQ2_XS: '#fbbf24',
	MXFP4: '#a78bfa', F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)', F16: 'rgba(255, 255, 255, 0.4)',
};

interface IHubModelDetailProps {
	modelId: string;
	modelRoots: string[];
}

function FileRow({ file, modelRoots, author, modelName, existsInRoot }: {
	file: IHubFile;
	modelRoots: string[];
	author: string;
	modelName: string;
	existsInRoot: string | null;
}) {
	const { toast } = useToast();
	const [showDirPicker, setShowDirPicker] = useState(false);
	const [downloading, setDownloading] = useState(false);
	const quantColor = QUANT_COLORS[file.quantType] ?? 'rgba(255, 255, 255, 0.4)';

	const handleDownload = async (destRoot: string) => {
		setDownloading(true);
		const result = await startHubDownload({
			author,
			modelName,
			filename: file.filename,
			destRoot,
		});
		setDownloading(false);
		if (result.ok) {
			toast('success', `Downloading ${file.filename}`);
		} else {
			toast('error', result.error ?? 'Download failed');
		}
	};

	const handleDownloadClick = () => {
		if (modelRoots.length === 1) {
			handleDownload(modelRoots[0]!);
		} else {
			setShowDirPicker(true);
		}
	};

	return (
		<Flex
			justify="space-between" align="center"
			px="4" py="3" borderRadius="lg"
			bg="rgba(255, 255, 255, 0.02)"
			borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
			_hover={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
			transition="all 0.1s ease"
		>
			<HStack gap="3" flex="1" minW="0">
				<Flex
					w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center"
					bg={file.isDownloaded ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.04)'}
					flexShrink={0}
				>
					{file.isDownloaded
						? <CheckCircle size={16} color="#34d399" />
						: <Layers size={16} color="rgba(255, 255, 255, 0.3)" />
					}
				</Flex>
				<Box flex="1" minW="0">
					<Text fontSize="12px" fontWeight="500" color="#e4e4e7" fontFamily='"Geist Mono", monospace' lineClamp={1}>
						{file.filename}
					</Text>
					<HStack gap="2" mt="0.5">
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace'>
							{formatBytes(file.size)}
						</Text>
						{file.isDownloaded && file.downloadedInRoot && (
							<Text fontSize="10px" color="rgba(52, 211, 153, 0.6)" lineClamp={1}>
								in {file.downloadedInRoot}
							</Text>
						)}
					</HStack>
				</Box>
			</HStack>

			<HStack gap="2" flexShrink={0}>
				{file.quantType && (
					<Badge
						px="2" py="0.5" borderRadius="md" fontSize="11px" fontWeight="600"
						bg={`color-mix(in srgb, ${quantColor} 12%, transparent)`}
						color={quantColor}
						borderWidth="1px" borderColor={`color-mix(in srgb, ${quantColor} 20%, transparent)`}
					>
						{file.quantType}
					</Badge>
				)}

				{file.isDownloaded ? (
					<Badge
						px="2.5" py="1" borderRadius="lg" fontSize="11px" fontWeight="500"
						bg="rgba(52, 211, 153, 0.08)" color="#34d399"
						borderWidth="1px" borderColor="rgba(52, 211, 153, 0.15)"
					>
						<CheckCircle size={11} /> Downloaded
					</Badge>
				) : (
					<Box position="relative">
						<Button
							size="xs" px="3" borderRadius="lg" fontSize="11px" fontWeight="500"
							bg="rgba(51, 129, 255, 0.1)" color="#3381ff"
							borderWidth="1px" borderColor="rgba(51, 129, 255, 0.25)"
							_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
							onClick={handleDownloadClick}
							disabled={downloading}
						>
							{downloading ? <Spinner size="xs" /> : <ArrowDownToLine size={12} />}
							Download
						</Button>
						{showDirPicker && (
							<DirPickerPopover
								roots={modelRoots}
								existsInRoot={existsInRoot}
								onSelect={handleDownload}
								onClose={() => setShowDirPicker(false)}
							/>
						)}
					</Box>
				)}
			</HStack>
		</Flex>
	);
}

export function HubModelDetail({ modelId, modelRoots }: IHubModelDetailProps) {
	const [detail, setDetail] = useState<IHubModelDetail | null>(null);
	const [loading, setLoading] = useState(true);

	const [author, name] = modelId.split('/');

	useEffect(() => {
		setLoading(true);
		fetchHubModel(author!, name!).then(result => {
			if (result.ok) setDetail(result.data);
			setLoading(false);
		});
	}, [modelId]);

	if (loading) {
		return (
			<Flex h="100%" alignItems="center" justifyContent="center">
				<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
			</Flex>
		);
	}

	if (!detail) {
		return (
			<Flex h="100%" alignItems="center" justifyContent="center">
				<Text color="rgba(255, 255, 255, 0.25)">Failed to load model details</Text>
			</Flex>
		);
	}

	const ggufFiles = detail.files.filter((f: IHubFile) => f.isGguf);
	const otherFiles = detail.files.filter((f: IHubFile) => !f.isGguf);

	// Find if any file from this repo exists in a root (for dir picker hint)
	const existsInRoot = detail.files.find((f: IHubFile) => f.downloadedInRoot)?.downloadedInRoot ?? null;

	return (
		<Box p="6">
			<VStack align="stretch" gap="6">
				{/* Header */}
				<Box>
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)" mb="1">{detail.author}</Text>
					<Text fontSize="22px" fontWeight="700" color="#e4e4e7" letterSpacing="-0.02em">
						{detail.modelId}
					</Text>

					<HStack gap="4" mt="3" flexWrap="wrap">
						<HStack gap="1.5" color="rgba(255, 255, 255, 0.4)">
							<Download size={13} />
							<Text fontSize="12px" fontFamily='"Geist Mono", monospace'>{formatCount(detail.downloads)}</Text>
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)">downloads</Text>
						</HStack>
						<HStack gap="1.5" color="rgba(255, 255, 255, 0.4)">
							<Heart size={13} />
							<Text fontSize="12px" fontFamily='"Geist Mono", monospace'>{formatCount(detail.likes)}</Text>
						</HStack>
						<HStack gap="1.5" color="rgba(255, 255, 255, 0.25)">
							<Calendar size={12} />
							<Text fontSize="11px">Created {formatDate(detail.createdAt)}</Text>
						</HStack>
						<HStack gap="1.5" color="rgba(255, 255, 255, 0.25)">
							<Clock size={12} />
							<Text fontSize="11px">Updated {formatDate(detail.lastModified)}</Text>
						</HStack>
					</HStack>

					{detail.tags.length > 0 && (
						<HStack gap="1.5" mt="3" flexWrap="wrap">
							{detail.tags.slice(0, 15).map((tag: string) => (
								<Badge
									key={tag} px="2" py="0.5" borderRadius="md" fontSize="10px"
									bg="rgba(255, 255, 255, 0.04)" color="rgba(255, 255, 255, 0.4)"
									borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
								>
									{tag}
								</Badge>
							))}
							{detail.tags.length > 15 && (
								<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)">
									+{detail.tags.length - 15} more
								</Text>
							)}
						</HStack>
					)}
				</Box>

				{/* GGUF Files */}
				{ggufFiles.length > 0 && (
					<Box>
						<HStack gap="2" mb="3">
							<Text fontSize="13px" fontWeight="600" color="rgba(255, 255, 255, 0.6)">
								GGUF Files
							</Text>
							<Badge
								px="2" py="0" borderRadius="full" fontSize="11px"
								bg="rgba(255, 255, 255, 0.06)" color="rgba(255, 255, 255, 0.4)"
							>
								{ggufFiles.length}
							</Badge>
						</HStack>
						<VStack align="stretch" gap="2">
							{ggufFiles.map((file: IHubFile) => (
								<FileRow
									key={file.filename}
									file={file}
									modelRoots={modelRoots}
									author={detail.author}
									modelName={detail.modelId}
									existsInRoot={existsInRoot}
								/>
							))}
						</VStack>
					</Box>
				)}

				{/* Other files (collapsed) */}
				{otherFiles.length > 0 && (
					<Box>
						<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)" mb="2">
							{otherFiles.length} other file{otherFiles.length > 1 ? 's' : ''} (config, tokenizer, etc.)
						</Text>
					</Box>
				)}

				{/* README */}
				{detail.readme && (
					<Box>
						<HStack gap="2" mb="3">
							<FileText size={14} color="rgba(255, 255, 255, 0.4)" />
							<Text fontSize="13px" fontWeight="600" color="rgba(255, 255, 255, 0.6)">
								README
							</Text>
						</HStack>
						<Box
							px="5" py="4" borderRadius="xl"
							bg="rgba(255, 255, 255, 0.02)"
							borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
							fontSize="13px" lineHeight="1.7" color="rgba(255, 255, 255, 0.6)"
							css={{
								'& h1': { fontSize: '18px', fontWeight: 700, color: '#e4e4e7', marginTop: '16px', marginBottom: '8px' },
								'& h2': { fontSize: '16px', fontWeight: 600, color: '#e4e4e7', marginTop: '14px', marginBottom: '6px' },
								'& h3': { fontSize: '14px', fontWeight: 600, color: '#e4e4e7', marginTop: '12px', marginBottom: '4px' },
								'& p': { marginBottom: '8px' },
								'& code': { fontFamily: '"Geist Mono", monospace', fontSize: '12px', bg: 'rgba(255, 255, 255, 0.06)', padding: '1px 4px', borderRadius: '4px' },
								'& pre': { fontFamily: '"Geist Mono", monospace', fontSize: '12px', bg: 'rgba(255, 255, 255, 0.04)', padding: '12px', borderRadius: '8px', overflow: 'auto', marginBottom: '8px' },
								'& a': { color: '#3381ff', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } },
								'& ul, & ol': { paddingLeft: '20px', marginBottom: '8px' },
								'& li': { marginBottom: '2px' },
								'& table': { borderCollapse: 'collapse', width: '100%', marginBottom: '8px' },
								'& th, & td': { border: '1px solid rgba(255, 255, 255, 0.08)', padding: '6px 10px', fontSize: '12px' },
								'& th': { bg: 'rgba(255, 255, 255, 0.04)', fontWeight: 600 },
								'& hr': { border: 'none', borderTop: '1px solid rgba(255, 255, 255, 0.06)', margin: '12px 0' },
								'& img': { maxWidth: '100%', borderRadius: '8px' },
								'& blockquote': { borderLeft: '3px solid rgba(51, 129, 255, 0.3)', paddingLeft: '12px', color: 'rgba(255, 255, 255, 0.5)' },
							}}
							whiteSpace="pre-wrap"
						>
							{detail.readme}
						</Box>
					</Box>
				)}
			</VStack>
		</Box>
	);
}
