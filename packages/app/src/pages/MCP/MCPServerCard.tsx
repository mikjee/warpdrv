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
			borderColor="rgba(255,255,255,0.06)"
			borderRadius="md"
			bg="rgba(255,255,255,0.02)"
			_hover={{ borderColor: 'rgba(255,255,255,0.1)' }}
		>
			<HStack gap="3" mb="2">
				<McpStatusDot status={status} />
				<Text fontSize="14px" fontWeight="500" color="rgba(255,255,255,0.85)" flex="1">
					{name}
				</Text>
				<Badge
					fontSize="10px"
					px="1.5"
					borderRadius="sm"
					bg="rgba(255,255,255,0.06)"
					color="rgba(255,255,255,0.4)"
				>
					{transportType}
				</Badge>
				{state && (
					<Badge
						fontSize="10px"
						px="1.5"
						borderRadius="sm"
						bg="rgba(255,255,255,0.06)"
						color="rgba(255,255,255,0.4)"
					>
						{state.tools.length} tools
					</Badge>
				)}
			</HStack>

			<Text fontSize="11px" color="rgba(255,255,255,0.35)" mb="2" fontFamily="mono">
				{connectionDetail}
			</Text>

			{state?.error && (
				<Text fontSize="11px" color="rgba(239,68,68,0.8)" mb="2">
					{state.error}
				</Text>
			)}

			<HStack gap="1" justify="flex-end">
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(255,255,255,0.06)' }}
					onClick={onRefresh}
					title="Refresh tools"
				>
					<RefreshCw size={13} color="rgba(255,255,255,0.4)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(255,255,255,0.06)' }}
					onClick={onRestart}
					title="Restart server"
				>
					<RotateCcw size={13} color="rgba(255,255,255,0.4)" />
				</Box>
				<Box
					as="button"
					p="1.5"
					borderRadius="sm"
					_hover={{ bg: 'rgba(239,68,68,0.1)' }}
					onClick={onRemove}
					title="Remove server"
				>
					<Trash2 size={13} color="rgba(239,68,68,0.5)" />
				</Box>
			</HStack>
		</Box>
	);
}
