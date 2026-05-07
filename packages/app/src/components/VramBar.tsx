import { Box, Flex, Text, HStack } from '@chakra-ui/react';

interface IVramBarProps {
	totalMb: number;
	usedMb: number;
	label?: string;
	compact?: boolean;
}

function formatGb(mb: number): string {
	return (mb / 1024).toFixed(1) + ' GB';
}

export function VramBar({ totalMb, usedMb, label, compact = false }: IVramBarProps) {
	const pct = Math.min((usedMb / totalMb) * 100, 100);
	const isHigh = pct > 85;
	const isMedium = pct > 60;
	const barColor = isHigh ? 'var(--wc-accent-red)' : isMedium ? 'var(--wc-accent-yellow)' : 'var(--wc-accent-green)';

	return (
		<Box>
			{!compact && (
				<Flex justify="space-between" mb="1.5">
					<Text fontSize="12px" color="var(--wc-text-tertiary)">
						{label ?? 'VRAM'}
					</Text>
					<HStack gap="1">
						<Text fontSize="12px" fontFamily='"Geist Mono", monospace' color="var(--wc-text-secondary)">
							{formatGb(usedMb)}
						</Text>
						<Text fontSize="12px" color="var(--wc-text-faint)">/</Text>
						<Text fontSize="12px" fontFamily='"Geist Mono", monospace' color="var(--wc-text-muted)">
							{formatGb(totalMb)}
						</Text>
					</HStack>
				</Flex>
			)}
			<Box
				h={compact ? '4px' : '6px'}
				bg="var(--wc-bg-hover)"
				borderRadius="full"
				overflow="hidden"
			>
				<Box
					h="100%"
					w={`${pct}%`}
					bg={barColor}
					borderRadius="full"
					transition="width 0.5s ease, background 0.3s ease"
					shadow={`0 0 12px color-mix(in srgb, ${barColor} 40%, transparent)`}
				/>
			</Box>
		</Box>
	);
}
