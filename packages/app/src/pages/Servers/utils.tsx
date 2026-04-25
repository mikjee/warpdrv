import { Box, HStack, Text } from '@chakra-ui/react';
import React from 'react';

export const QUANT_COLORS: Record<string, string> = {
	Q5_K_XL: '#34d399', Q6_K_XL: '#34d399', Q6_K: '#34d399', Q4_K_M: '#34d399',
	Q5_K_M: '#34d399', Q5_K_S: '#34d399', Q4_K_S: '#34d399', Q3_K_M: '#fbbf24',
	IQ3_XXS: '#fbbf24', IQ3_M: '#fbbf24', IQ3_XS: '#fbbf24',
	IQ4_XS: '#fbbf24', MXFP4: '#a78bfa', NVFP4: '#a78bfa',
	F32: 'rgba(255, 255, 255, 0.4)', BF16: 'rgba(255, 255, 255, 0.4)', F16: 'rgba(255, 255, 255, 0.4)',
};

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
		<HStack gap="1.5" px="1.5" py="0.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)">
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			<Text fontSize="11px" fontWeight="400" color="rgba(255, 255, 255, 0.75)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}
