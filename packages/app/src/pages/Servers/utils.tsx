import { Box, HStack, Text } from '@chakra-ui/react';
import React from 'react';

export { QUANT_COLORS } from '@/lib/constants';

export function formatUptime(startedAt: number | null): string {
	if (!startedAt) return '-';
	const ms = Date.now() - startedAt;
	const mins = Math.floor(ms / 60000);
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	return `${hours}h ${mins % 60}m`;
}

export function formatCount(n: number): string {
	if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
	if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
	return String(n);
}

export function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="1.5" py="0.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)"  title={label}>
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			<Text fontSize="11px" fontWeight="400" color="rgba(255, 255, 255, 0.75)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}
