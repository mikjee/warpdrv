import { Box, Flex, Text, HStack, Badge, VStack } from '@chakra-ui/react';
import { MonitorSpeaker } from 'lucide-react';
import { Card } from '../../components/Card';
import { VramBar } from '../../components/VramBar';
import type { IDevice } from '@warpcore/shared';
import { BACKEND_COLORS } from '../../lib/deviceColors';

export function DeviceCard({ device }: { device: IDevice }) {
	const color = BACKEND_COLORS[device.backendType] ?? '#3381ff';

	return (
		<Card w="350px" variant="accent" accentColor={color}>
			<VStack align="stretch" gap="3">
				<Flex justify="space-between" align="start">
					<HStack gap="3">
						<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--wc-bg-card)">
							<MonitorSpeaker size={20} color="var(--wc-text-tertiary)" />
						</Flex>
						<Box>
							<Text fontSize="14px" fontWeight="600" color="var(--wc-special-row-name)">{device.name}</Text>
							<Text fontSize="12px" color="var(--wc-special-mono-gray)" fontFamily='"Geist Mono", monospace'>{device.id}</Text>
						</Box>
					</HStack>
					<Badge px="2" py="0.5" borderRadius="md" fontSize="11px" fontWeight="600" bg={`color-mix(in srgb, ${color} 15%, transparent)`} color={color} borderWidth="1px" borderColor={`color-mix(in srgb, ${color} 25%, transparent)`}>
						{device.backendType}
					</Badge>
				</Flex>

				{device.vramTotalMb > 0 && (
					<VramBar totalMb={device.vramTotalMb} usedMb={device.vramTotalMb - device.vramFreeMb} />
				)}

				<HStack gap="6">
					{device.computeCapability && (
						<Box>
<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">Compute</Text>
						<Text fontSize="12px" color="var(--wc-special-mono-gray)" fontFamily='"Geist Mono", monospace'>{device.computeCapability}</Text>
						</Box>
					)}
					{device.connection && (
						<Box>
<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em">Connection</Text>
						<Text fontSize="12px" color="var(--wc-text-primary)">{device.connection}</Text>
						</Box>
					)}
				</HStack>
			</VStack>
		</Card>
	);
}
