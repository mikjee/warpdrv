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
		<HStack gap="1.5" px="1.5" py="0.5" borderRadius="lg" bg="var(--w-servers-pill-bg)" borderWidth="1px" borderColor="var(--w-servers-pill-border)"  title={label}>
			<Box color="var(--w-servers-pill-icon)">{icon}</Box>
			<Text fontSize="11px" fontWeight="400" color="var(--w-servers-pill-text)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}
