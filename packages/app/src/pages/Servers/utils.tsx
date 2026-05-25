import { Box, HStack, Text } from '@chakra-ui/react';
import React from 'react';
import { parse } from "shell-quote";

export { QUANT_COLORS } from '@/lib/constants';

export function formatLaunchCommand(cmd: string): string {
	const tokens = parse(cmd).filter((t): t is string => typeof t === "string");
	if (tokens.length === 0) return "";

	const lines: string[] = [tokens[0]];
	let i = 1;
	while (i < tokens.length) {
		const tok = tokens[i]!;
		const next = tokens[i + 1];
		if (tok.startsWith("-") && next !== undefined && !next.startsWith("-")) {
			lines.push(`\t${tok} ${next}`);
			i += 2;
		} else {
			lines.push(`\t${tok}`);
			i += 1;
		}
	}
	return lines.join("\n");
}

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
		<HStack gap="1.5" title={label}>
			<Box color="var(--wc-text-faint)">{icon}</Box>
			<Text fontSize="11px" fontWeight="400" color="var(--wc-text-secondary)" >{value}</Text>
		</HStack>
	);
}
