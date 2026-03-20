import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner } from '@chakra-ui/react';
import { FolderOpen, FileText, Package, Layers, RefreshCw, Search } from 'lucide-react';
import { useState, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useListQuery, useMutation } from '../hooks/useQuery';
import { fetchModels, scanModels } from '../api/services';
import type { IModel, IGgufFile } from '@warpcore/shared';
import type { IApiListResponse } from '@warpcore/shared';

const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q8_0: '#22d3ee', IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24', IQ3_XS: '#fbbf24',
	MXFP4: '#a78bfa', F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)', F16: 'rgba(255, 255, 255, 0.4)',
};

function formatSize(mb: number): string {
	if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
	return mb + ' MB';
}

export function ModelsPage() {
	const fetcher = useCallback(() => fetchModels(), []);
	const { data: models, loading, refetch } = useListQuery<IModel>(fetcher);
	const scanMut = useMutation<void, IModel[]>(
		useCallback(() => scanModels() as Promise<any>, [])
	);

	const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
	const selected = models.find(m => m.id === selectedModelId);

	// Group by user
	const grouped = models.reduce<Record<string, IModel[]>>((acc, model) => {
		if (!acc[model.user]) acc[model.user] = [];
		acc[model.user]!.push(model);
		return acc;
	}, {});

	const handleScan = async () => {
		await scanMut.mutate(undefined as any);
		await refetch();
	};

	return (
		<Box>
			<PageHeader
				title="Models"
				subtitle={`${models.length} models found`}
				icon={<FolderOpen size={20} />}
				actions={
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
						Scan Folders
					</Button>
				}
			/>
			<Flex h="calc(100vh - 89px)">
				{/* Tree panel */}
				<Box w="340px" minW="340px" borderRightWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" overflowY="auto" p="4">
					{loading && models.length === 0 ? (
						<Flex h="100px" alignItems="center" justifyContent="center">
							<Spinner size="md" color="rgba(255, 255, 255, 0.2)" />
						</Flex>
					) : models.length === 0 ? (
						<Flex h="100px" alignItems="center" justifyContent="center">
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.25)">No models. Configure a directory in Settings, then scan.</Text>
						</Flex>
					) : (
						<VStack align="stretch" gap="1">
							{Object.entries(grouped).map(([user, userModels]) => (
								<Box key={user}>
									<HStack gap="2" px="2" py="1.5" color="rgba(255, 255, 255, 0.4)">
										<FolderOpen size={14} />
										<Text fontSize="12px" fontWeight="600" textTransform="uppercase" letterSpacing="0.04em">{user}</Text>
									</HStack>
									{userModels.map(model => (
										<HStack
											key={model.id}
											gap="2" px="2" py="2" pl="7" borderRadius="md" cursor="pointer"
											bg={selectedModelId === model.id ? 'rgba(51, 129, 255, 0.08)' : 'transparent'}
											color={selectedModelId === model.id ? '#3381ff' : 'rgba(255, 255, 255, 0.6)'}
											_hover={{ bg: 'rgba(255, 255, 255, 0.04)' }}
											onClick={() => setSelectedModelId(model.id)}
											transition="all 0.1s ease"
										>
											<Package size={14} />
											<Text fontSize="13px" lineClamp={1} flex="1">{model.name}</Text>
											<Text fontSize="11px" color="rgba(255, 255, 255, 0.25)" fontFamily='"Geist Mono", monospace'>{model.files.length}</Text>
										</HStack>
									))}
								</Box>
							))}
						</VStack>
					)}
				</Box>

				{/* Detail panel */}
				<Box flex="1" overflowY="auto" p="6">
					{selected ? (
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1">{selected.user}</Text>
								<Text fontSize="18px" fontWeight="700" color="#e4e4e7" letterSpacing="-0.01em">{selected.name}</Text>
								{selected.primaryFile?.metadata && (
									<HStack gap="3" mt="2">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">{selected.primaryFile.metadata.architecture}</Text>
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">{selected.primaryFile.metadata.paramCount}</Text>
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">{selected.primaryFile.metadata.nLayers} layers</Text>
										{selected.primaryFile.metadata.contextLength > 0 && (
											<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">ctx {(selected.primaryFile.metadata.contextLength / 1024).toFixed(0)}k</Text>
										)}
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">total {formatSize(selected.totalSizeMb)}</Text>
									</HStack>
								)}
							</Box>

							<VStack align="stretch" gap="3">
								{selected.files.map((file: IGgufFile) => {
									const isModel = !file.isMmproj;
									const quantColor = file.metadata?.quantType
										? (QUANT_COLORS[file.metadata.quantType] ?? 'rgba(255, 255, 255, 0.4)')
										: 'rgba(255, 255, 255, 0.4)';
									const quantLabel = file.metadata?.quantType ?? (file.isMmproj ? 'mmproj' : '?');

									return (
										<Card key={file.fileName}>
											<Flex justify="space-between" align="center">
												<HStack gap="3">
													<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg={isModel ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'}>
														{isModel ? <Layers size={16} color="#3381ff" /> : <FileText size={16} color="rgba(255, 255, 255, 0.3)" />}
													</Flex>
													<Box>
														<Text fontSize="13px" fontWeight="500" color="#e4e4e7" fontFamily='"Geist Mono", monospace'>{file.fileName}</Text>
														<HStack gap="2" mt="0.5">
															{file.shardIndex !== null && <Text fontSize="11px" color="rgba(255, 255, 255, 0.25)">Shard {file.shardIndex}/{file.shardTotal}</Text>}
															{file.isMmproj && <Text fontSize="11px" color="#a78bfa">Vision projector</Text>}
														</HStack>
													</Box>
												</HStack>
												<HStack gap="3">
													<Badge px="2" py="0.5" borderRadius="md" fontSize="11px" fontWeight="600" bg={`color-mix(in srgb, ${quantColor} 12%, transparent)`} color={quantColor} borderWidth="1px" borderColor={`color-mix(in srgb, ${quantColor} 20%, transparent)`}>
														{quantLabel}
													</Badge>
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>{formatSize(file.sizeMb)}</Text>
												</HStack>
											</Flex>
										</Card>
									);
								})}
							</VStack>
						</VStack>
					) : (
						<Flex h="100%" alignItems="center" justifyContent="center">
							<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
								<Package size={40} />
								<Text fontSize="14px">Select a model to view details</Text>
							</VStack>
						</Flex>
					)}
				</Box>
			</Flex>
		</Box>
	);
}
