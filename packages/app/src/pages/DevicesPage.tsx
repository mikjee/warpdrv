import { Box, SimpleGrid, Text, HStack, VStack, Flex, Badge, Spinner } from '@chakra-ui/react';
import { Cpu, MonitorSpeaker, RefreshCw } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { VramBar } from '../components/VramBar';
import { useListQuery } from '../hooks/useQuery';
import { useStore } from '../store';
import { fetchBackends } from '../api/services';
import type { IBackend, IDevice } from '@warpcore/shared';
import { EDeviceBackendType } from '@warpcore/shared';

const BACKEND_COLORS: Record<string, string> = {
	[EDeviceBackendType.CUDA]: '#76b900',
	[EDeviceBackendType.ROCM]: '#ed1c24',
	[EDeviceBackendType.VULKAN]: '#a78bfa',
};

export function DevicesPage() {
	// Fetch backends once (for backend names)
	const { data: backends, loading } = useListQuery<IBackend>(useCallback(() => fetchBackends(), []), { pollInterval: 0 });

	// Use devices from SSE (for VRAM updates)
	const devices = useStore((s: any) => s.devices);

	// Merge backend names with device data
	const devicesWithBackend: (IDevice & { backendName: string })[] = useMemo(() => {
		if (!Array.isArray(devices)) return [];
		const backendMap = new Map(backends?.map(b => [b.id, b.name]));
		return devices.map((d: IDevice) => ({
			...d,
			backendName: backendMap.get(d.backendId) || 'Unknown',
		}));
	}, [devices, backends]);

	return (
		<Box>
			<PageHeader
				title="Devices"
				subtitle="Detected GPUs across all registered backends"
				icon={<Cpu size={20} />}
			/>
			<Box p="4">
				{loading && devices.length === 0 ? (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
					</Flex>
				) : devices.length === 0 ? (
					<Flex h="200px" alignItems="center" justifyContent="center">
						<VStack gap="3" color="rgba(255, 255, 255, 0.2)">
							<MonitorSpeaker size={40} />
							<Text fontSize="14px">No devices detected</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.15)">Register a backend first</Text>
						</VStack>
					</Flex>
				) : (
					<SimpleGrid columns={{ base: 1, lg: 2 }} gap="4">
						{devicesWithBackend.map((device, idx: number) => {
							const color = BACKEND_COLORS[device.backendType] ?? '#3381ff';
							return (
								<Card key={`${device.backendId}-${idx}`} variant="accent" accentColor={color}>
									<VStack align="stretch" gap="4">
										<Flex justify="space-between" align="start">
											<HStack gap="3">
												<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)">
													<MonitorSpeaker size={20} color="rgba(255, 255, 255, 0.5)" />
												</Flex>
												<Box>
													<Text fontSize="14px" fontWeight="600" color="#e4e4e7">{device.name}</Text>
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)" fontFamily='"Geist Mono", monospace'>{device.id}</Text>
												</Box>
											</HStack>
											<Badge px="2.5" py="0.5" borderRadius="md" fontSize="11px" fontWeight="600" bg={`color-mix(in srgb, ${color} 15%, transparent)`} color={color} borderWidth="1px" borderColor={`color-mix(in srgb, ${color} 25%, transparent)`}>
												{device.backendType}
											</Badge>
										</Flex>
										{device.vramTotalMb > 0 && <VramBar totalMb={device.vramTotalMb} usedMb={device.vramTotalMb - device.vramFreeMb} />}
										<HStack gap="6">
											{device.computeCapability && (
												<Box>
													<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Compute</Text>
													<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'>{device.computeCapability}</Text>
												</Box>
											)}
											<Box>
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Backend</Text>
												<Text fontSize="12px" color="rgba(255, 255, 255, 0.7)">{device.backendName}</Text>
											</Box>
										</HStack>
									</VStack>
								</Card>
							);
						})}
					</SimpleGrid>
				)}
			</Box>
		</Box>
	);
}
