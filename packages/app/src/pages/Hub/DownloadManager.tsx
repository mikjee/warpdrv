import React, { useState } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Button, Badge, Spinner,
} from '@chakra-ui/react';
import {
	X, Download, Pause, Play, Trash2, CheckCircle, AlertCircle,
	XCircle, Clock,
} from 'lucide-react';
import { EDownloadStatus, type IDownload } from '@warpcore/shared';
import { useStore } from '../../store';
import {
	pauseHubDownload, resumeHubDownload,
	cancelHubDownload, clearDownloadHistory,
} from '../../api/services';
import { useToast } from '../../components/ToastProvider';

function formatBytes(bytes: number): string {
	if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
	if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
	if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
	return bytes + ' B';
}

function formatSpeed(bps: number): string {
	if (bps >= 1048576) return (bps / 1048576).toFixed(1) + ' MB/s';
	if (bps >= 1024) return (bps / 1024).toFixed(0) + ' KB/s';
	return bps + ' B/s';
}

function formatEta(remainingBytes: number, speedBps: number): string {
	if (speedBps <= 0) return '--';
	const secs = remainingBytes / speedBps;
	if (secs < 60) return `${Math.ceil(secs)}s`;
	if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.ceil(secs % 60)}s`;
	return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

const STATUS_CONFIG: Record<EDownloadStatus, { color: string; icon: React.ReactNode; label: string }> = {
	[EDownloadStatus.DOWNLOADING]: { color: '#3381ff', icon: <Download size={11} />, label: 'Downloading' },
	[EDownloadStatus.PAUSED]: { color: '#fbbf24', icon: <Pause size={11} />, label: 'Paused' },
	[EDownloadStatus.COMPLETED]: { color: '#34d399', icon: <CheckCircle size={11} />, label: 'Completed' },
	[EDownloadStatus.FAILED]: { color: '#fb7185', icon: <AlertCircle size={11} />, label: 'Failed' },
	[EDownloadStatus.CANCELLED]: { color: 'rgba(255, 255, 255, 0.3)', icon: <XCircle size={11} />, label: 'Cancelled' },
};

interface IDownloadManagerProps {
	onClose: () => void;
}

export const DownloadManager = React.memo(({ onClose }: IDownloadManagerProps) => {
	const { toast } = useToast();
	const [incompleteOnly, setIncompleteOnly] = useState(false);

	const downloads = Object.values(useStore((s) => s.downloads));

	const filtered = incompleteOnly
		? downloads.filter((d: IDownload) => d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.PAUSED)
		: downloads;

	const activeCount = downloads.filter((d: IDownload) => d.status === EDownloadStatus.DOWNLOADING || d.status === EDownloadStatus.PAUSED).length;

	const handlePause = async (id: string) => {
		await pauseHubDownload(id);
	};

	const handleResume = async (id: string) => {
		await resumeHubDownload(id);
	};

	const handleCancel = async (id: string) => {
		await cancelHubDownload(id);
	};

	const handleClearHistory = async () => {
		await clearDownloadHistory();
		toast('info', 'Download history cleared');
	};

	return (
		<Box
			position="fixed" bottom="20px" right="20px"  w="600px" h="420px"
			bg="#0c0c0f" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)"
			borderTopLeftRadius="xl" shadow="0 -8px 40px rgba(0, 0, 0, 0.5)"
			zIndex="popover" display="flex" flexDirection="column" overflow="hidden"
		>
			{/* Header */}
			<Flex
				px="4" py="3" justify="space-between" align="center"
				borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
				bg="rgba(255, 255, 255, 0.02)" flexShrink={0}
			>
				<HStack gap="2.5">
					<Download size={14} color="rgba(255, 255, 255, 0.4)" />
					<Text fontSize="13px" fontWeight="600" color="rgba(255, 255, 255, 0.6)">
						Downloads
					</Text>
					{activeCount > 0 && (
						<Badge
							px="1.5" py="0" borderRadius="full" fontSize="10px"
							bg="rgba(51, 129, 255, 0.15)" color="#3381ff"
						>
							{activeCount}
						</Badge>
					)}
				</HStack>

				<HStack gap="2">
					{/* Incomplete only toggle */}
					<Button
						size="xs" px="2.5" borderRadius="md" fontSize="11px"
						bg={incompleteOnly ? 'rgba(51, 129, 255, 0.1)' : 'rgba(255, 255, 255, 0.03)'}
						color={incompleteOnly ? '#3381ff' : 'rgba(255, 255, 255, 0.3)'}
						borderWidth="1px"
						borderColor={incompleteOnly ? 'rgba(51, 129, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)'}
						_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
						onClick={() => setIncompleteOnly(!incompleteOnly)}
					>
						Incomplete only
					</Button>
					<Button
						size="xs" variant="ghost" color="rgba(255, 255, 255, 0.25)"
						_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }}
						borderRadius="md" onClick={handleClearHistory} fontSize="10px"
					>
						Clear history
					</Button>
					<Button
						size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)"
						_hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }}
						borderRadius="md" onClick={onClose}
					>
						<X size={14} />
					</Button>
				</HStack>
			</Flex>

			{/* Download list */}
			<Box flex="1" overflowY="auto" p="3">
				{filtered.length === 0 ? (
					<Flex h="100%" alignItems="center" justifyContent="center">
						<VStack gap="2" color="rgba(255, 255, 255, 0.15)">
							<Download size={28} />
							<Text fontSize="12px">{incompleteOnly ? 'No active downloads' : 'No downloads yet'}</Text>
						</VStack>
					</Flex>
				) : (
					<VStack align="stretch" gap="2">
						{filtered.map((dl: IDownload) => {
							const statusConfig = STATUS_CONFIG[dl.status] ?? STATUS_CONFIG[EDownloadStatus.FAILED];
							const isActive = dl.status === EDownloadStatus.DOWNLOADING;
							const isPaused = dl.status === EDownloadStatus.PAUSED;
							const remainingBytes = dl.fileSizeBytes - dl.downloadedBytes;

							return (
								<Box
									key={dl.id} px="3" py="3" borderRadius="lg"
									bg="rgba(255, 255, 255, 0.02)"
									borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)"
								>
									<Flex justify="space-between" align="start" mb="2">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="#e4e4e7" lineClamp={1} fontFamily='"Geist Mono", monospace'>
												{dl.filename}
											</Text>
											<HStack gap="2" mt="0.5">
												<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)">
													{dl.author}/{dl.modelName}
												</Text>
												{dl.quantType && (
													<Badge px="1.5" py="0" borderRadius="sm" fontSize="9px"
														bg="rgba(167, 139, 250, 0.1)" color="#a78bfa"
													>
														{dl.quantType}
													</Badge>
												)}
											</HStack>
										</Box>

										<HStack gap="1" flexShrink={0}>
											{/* Status badge */}
											<HStack gap="1" px="2" py="0.5" borderRadius="full"
												bg={`color-mix(in srgb, ${statusConfig.color} 10%, transparent)`}
											>
												<Box color={statusConfig.color}>{statusConfig.icon}</Box>
												<Text fontSize="10px" color={statusConfig.color} fontWeight="500">
													{statusConfig.label}
												</Text>
											</HStack>

											{/* Actions */}
											{isActive && (
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)"
													_hover={{ color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.08)' }}
													borderRadius="md" onClick={() => handlePause(dl.id)} minW="6" px="0"
												>
													<Pause size={12} />
												</Button>
											)}
											{isPaused && (
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)"
													_hover={{ color: '#34d399', bg: 'rgba(52, 211, 153, 0.08)' }}
													borderRadius="md" onClick={() => handleResume(dl.id)} minW="6" px="0"
												>
													<Play size={12} />
												</Button>
											)}
											{(isActive || isPaused) && (
												<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.2)"
													_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }}
													borderRadius="md" onClick={() => handleCancel(dl.id)} minW="6" px="0"
												>
													<X size={12} />
												</Button>
											)}
										</HStack>
									</Flex>

									{/* Progress bar */}
									{(isActive || isPaused) && (
										<Box>
											<Box h="4px" bg="rgba(255, 255, 255, 0.06)" borderRadius="full" overflow="hidden" mb="1.5">
												<Box
													h="100%" w={`${dl.progress}%`}
													bg={isActive ? '#3381ff' : '#fbbf24'}
													borderRadius="full"
													transition="width 0.3s ease"
													shadow={isActive ? '0 0 8px rgba(51, 129, 255, 0.4)' : 'none'}
												/>
											</Box>
											<HStack justify="space-between">
												<HStack gap="3">
													<Text fontSize="10px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace'>
														{formatBytes(dl.downloadedBytes)} / {dl.fileSizeBytes > 0 ? formatBytes(dl.fileSizeBytes) : '?'}
													</Text>
													<Text fontSize="10px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace'>
														{dl.progress.toFixed(1)}%
													</Text>
												</HStack>
												<HStack gap="3">
													{isActive && dl.speedBps > 0 && (
														<Text fontSize="10px" color="rgba(51, 129, 255, 0.7)" fontFamily='"Geist Mono", monospace'>
															{formatSpeed(dl.speedBps)}
														</Text>
													)}
													{isActive && dl.speedBps > 0 && (
														<HStack gap="1" color="rgba(255, 255, 255, 0.25)">
															<Clock size={9} />
															<Text fontSize="10px" fontFamily='"Geist Mono", monospace'>
																{formatEta(remainingBytes, dl.speedBps)}
															</Text>
														</HStack>
													)}
												</HStack>
											</HStack>
										</Box>
									)}

									{/* Completed/failed info */}
									{dl.status === EDownloadStatus.COMPLETED && (
										<Text fontSize="10px" color="rgba(255, 255, 255, 0.2)" fontFamily='"Geist Mono", monospace'>
											{formatBytes(dl.fileSizeBytes)} — {dl.destPath}
										</Text>
									)}
									{dl.status === EDownloadStatus.FAILED && dl.error && (
										<Text fontSize="10px" color="rgba(251, 113, 133, 0.6)" lineClamp={1}>
											{dl.error}
										</Text>
									)}
								</Box>
							);
						})}
					</VStack>
				)}
			</Box>
		</Box>
	);
});
