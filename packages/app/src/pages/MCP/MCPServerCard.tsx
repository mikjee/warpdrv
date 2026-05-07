import React from 'react';
import { Box, Text, Badge, HStack } from '@chakra-ui/react';
import { RotateCcw, RefreshCw, Trash2 } from 'lucide-react';
import { McpStatusDot } from './McpStatusDot';
import type { IMcpServerEntry } from '@warpcore/shared';
import type { IMcpServerState } from '@warpcore/bridge';
import { EMcpServerStatus } from '@warpcore/bridge';

export function MCPServerCard({ name, entry, state, onRestart, onRefresh, onRemove }: {
	name: string;
	entry: IMcpServerEntry;
	state: IMcpServerState | null;
	onRestart: () => void;
	onRefresh: () => void;
	onRemove: () => void;
}) {
	const status = state?.status ?? EMcpServerStatus.DISCONNECTED;
	const transportType = entry.url ? 'HTTP' : 'STDIO';
	const connectionDetail = entry.url ?? `${entry.command} ${(entry.args ?? []).join(' ')}`;

	return (
		<Box
			p="3"
			borderWidth="1px"
			borderColor="var(--wc-border-subtle)"
			borderRadius="md"
			bg="var(--wc-bg-surface)"
			_hover={{ borderColor: 'var(--wc-border-overlay)' }}
		>
			<HStack gap="3" mb="2">
				<McpStatusDot status={status} />
				<Text fontSize="14px" fontWeight="500" color="var(--wc-text-heading)" flex="1">
					{name}
				</Text>
				<Badge
					fontSize="10px"
					px="1.5"
					borderRadius="sm"
					bg="var(--wc-bg-hover)"
					color="var(--wc-text-muted)"
				>
					{transportType}
				</Badge>
				{state && (
					<Badge
						fontSize="10px"
						px="1.5"
						borderRadius="sm"
						bg="var(--wc-bg-hover)"
						color="var(--wc-text-muted)"
					>
						{state.tools.length} tools
					</Badge>
				)}
			</HStack>

			<Text fontSize="11px" color="var(--wc-text-muted)" mb="2" fontFamily="mono">
				{connectionDetail}
			</Text>

			{state?.error && (
				<Text fontSize="11px" color="var(--wc-accent-red-alt)" mb="2">
					{state.error}
				</Text>
			)}

			<HStack gap="1" justify="flex-end">
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'var(--wc-bg-hover)' }}
					onClick={onRefresh}
					title="Refresh tools"
				>
					<RefreshCw size={13} color="var(--wc-text-tertiary)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'var(--wc-bg-hover)' }}
					onClick={onRestart}
					title="Restart server"
				>
					<RotateCcw size={13} color="var(--wc-text-tertiary)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'var(--wc-accent-red-alt-bg)' }}
					onClick={onRemove}
					title="Remove server"
				>
					<Trash2 size={13} color="var(--wc-accent-red-alt)" />
				</Box>
			</HStack>
		</Box>
	);
}
