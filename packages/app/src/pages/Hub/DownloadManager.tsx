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
	[EDownloadStatus.DOWNLOADING]: { color: 'var(--wc-accent-blue)', icon: <Download size={11} />, label: 'Downloading' },
	[EDownloadStatus.PAUSED]: { color: 'var(--wc-accent-yellow)', icon: <Pause size={11} />, label: 'Paused' },
	[EDownloadStatus.COMPLETED]: { color: 'var(--wc-accent-green)', icon: <CheckCircle size={11} />, label: 'Completed' },
	[EDownloadStatus.FAILED]: { color: 'var(--wc-accent-red)', icon: <AlertCircle size={11} />, label: 'Failed' },
	[EDownloadStatus.CANCELLED]: { color: 'var(--wc-text-tertiary)', icon: <XCircle size={11} />, label: 'Cancelled' },
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
			bg="var(--wc-bg-dialog)" borderWidth="1px" borderColor="var(--wc-border-default)"
			borderTopLeftRadius="xl" shadow="0 -8px 40px rgba(0, 0, 0, 0.5)"
			zIndex="popover" display="flex" flexDirection="column" overflow="hidden"
		>
			{/* Header */}
			<Flex
				px="4" py="3" justify="space-between" align="center"
				borderBottomWidth="1px" borderColor="var(--wc-border-subtle)"
				bg="var(--wc-bg-surface)" flexShrink={0}
			>
				<HStack gap="2.5">
					<Download size={14} color="var(--wc-text-tertiary)" />
					<Text fontSize="13px" fontWeight="600" color="var(--wc-text-secondary)">
						Downloads
					</Text>
					{activeCount > 0 && (
						<Badge
							px="1.5" py="0" borderRadius="full" fontSize="10px"
							bg="var(--wc-accent-blue-bg-15)" color="var(--wc-accent-blue)"
						>
							{activeCount}
						</Badge>
					)}
				</HStack>

				<HStack gap="2">
					{/* Incomplete only toggle */}
					<Button
						size="xs" px="2.5" borderRadius="md" fontSize="11px"
						bg={incompleteOnly ? 'var(--wc-accent-blue-bg-10)' : 'var(--wc-bg-subtle)'}
						color={incompleteOnly ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}
						borderWidth="1px"
						borderColor={incompleteOnly ? 'var(--wc-accent-blue-border)' : 'var(--wc-border-subtle)'}
						_hover={{ bg: 'var(--wc-bg-hover)' }}
						onClick={() => setIncompleteOnly(!incompleteOnly)}
					>
						Incomplete only
					</Button>
					<Button
						size="xs" variant="ghost" color="var(--wc-text-faint)"
						_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
						borderRadius="md" onClick={handleClearHistory} fontSize="10px"
					>
						Clear history
					</Button>
					<Button
						size="xs" variant="ghost" color="var(--wc-text-tertiary)"
						_hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }}
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
						<VStack gap="2" color="var(--wc-text-disabled)">
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
									bg="var(--wc-bg-surface)"
									borderWidth="1px" borderColor="var(--wc-border-subtle)"
								>
									<Flex justify="space-between" align="start" mb="2">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)" lineClamp={1} fontFamily='"Geist Mono", monospace'>
												{dl.filename}
											</Text>
											<HStack gap="2" mt="0.5">
												<Text fontSize="10px" color="var(--wc-text-faint)">
													{dl.author}/{dl.modelName}
												</Text>
												{dl.quantType && (
													<Badge px="1.5" py="0" borderRadius="sm" fontSize="9px"
														bg="var(--wc-accent-purple-bg-10)" color="var(--wc-accent-purple)"
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
												<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)"
													_hover={{ color: 'var(--wc-accent-yellow)', bg: 'var(--wc-accent-yellow-bg-8)' }}
													borderRadius="md" onClick={() => handlePause(dl.id)} minW="6" px="0"
												>
													<Pause size={12} />
												</Button>
											)}
											{isPaused && (
												<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)"
													_hover={{ color: 'var(--wc-accent-green)', bg: 'var(--wc-accent-green-bg-8)' }}
													borderRadius="md" onClick={() => handleResume(dl.id)} minW="6" px="0"
												>
													<Play size={12} />
												</Button>
											)}
											{(isActive || isPaused) && (
												<Button size="xs" variant="ghost" color="var(--wc-text-faint)"
													_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
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
											<Box h="4px" bg="var(--wc-bg-hover)" borderRadius="full" overflow="hidden" mb="1.5">
												<Box
													h="100%" w={`${dl.progress}%`}
													bg={isActive ? 'var(--wc-accent-blue)' : 'var(--wc-accent-yellow)'}
													borderRadius="full"
													transition="width 0.3s ease"
													shadow={isActive ? '0 0 8px rgba(51, 129, 255, 0.4)' : 'none'}
												/>
											</Box>
											<HStack justify="space-between">
												<HStack gap="3">
<Text fontSize="10px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>
													{formatBytes(dl.downloadedBytes)} / {dl.fileSizeBytes > 0 ? formatBytes(dl.fileSizeBytes) : '?'}
												</Text>
												<Text fontSize="10px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>
													{dl.progress.toFixed(1)}%
												</Text>
												</HStack>
												<HStack gap="3">
													{isActive && dl.speedBps > 0 && (
														<Text fontSize="10px" color="var(--wc-accent-blue-hover)" fontFamily='"Geist Mono", monospace'>
															{formatSpeed(dl.speedBps)}
														</Text>
													)}
													{isActive && dl.speedBps > 0 && (
														<HStack gap="1" color="var(--wc-text-faint)">
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
										<Text fontSize="10px" color="var(--wc-text-disabled)" fontFamily='"Geist Mono", monospace'>
											{formatBytes(dl.fileSizeBytes)} — {dl.destPath}
										</Text>
									)}
									{dl.status === EDownloadStatus.FAILED && dl.error && (
										<Text fontSize="10px" color="var(--wc-accent-red-icon)" lineClamp={1}>
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
