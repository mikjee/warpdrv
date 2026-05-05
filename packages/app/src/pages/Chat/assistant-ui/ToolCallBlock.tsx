// ============================================================
// FILE: packages/app/src/components/ToolCallBlock.tsx
// Inline tool call display for chat messages.
// Shows tool name, server, arguments, result, and
// approve/deny buttons for pending calls.
// ============================================================

import React, { useState } from 'react';
import { Box, Flex, Text, HStack, VStack } from '@chakra-ui/react';
import {
	Wrench,
	Check,
	Ban,
	ChevronDown,
	ChevronRight,
	Loader,
	AlertCircle,
	X
} from 'lucide-react';
import { decideMcpToolCall } from '../../../api/mcpServices';
import { EToolCallStatus } from '@warpcore/bridge';

interface IToolCallBlockProps {
	id: string;
	serverName: string;
	toolName: string;
	arguments: string;
	result?: string;
	status: EToolCallStatus;
	onDecided?: (decision: 'approve' | 'deny') => Promise<void>;
}

const statusColors: Record<EToolCallStatus, string> = {
	[EToolCallStatus.PENDING]: 'var(--wc-accent-yellow-strong)',
	[EToolCallStatus.DENIED]: 'var(--wc-accent-red)',
	[EToolCallStatus.EXECUTING]: 'var(--wc-accent-blue)',
	[EToolCallStatus.COMPLETED]: 'var(--wc-accent-green-icon)',
	[EToolCallStatus.ERROR]: 'var(--wc-accent-red)',
};

const statusLabels: Record<EToolCallStatus, string> = {
	[EToolCallStatus.PENDING]: 'Awaiting approval',
	[EToolCallStatus.DENIED]: 'Denied',
	[EToolCallStatus.EXECUTING]: 'Running',
	[EToolCallStatus.COMPLETED]: 'Completed',
	[EToolCallStatus.ERROR]: 'Error',
};

export function ToolCallBlock({
	id,
	serverName,
	toolName,
	arguments: args,
	result,
	status,
	onDecided,
}: IToolCallBlockProps) {
	const [argsExpanded, setArgsExpanded] = useState(false);
	const [resultExpanded, setResultExpanded] = useState(false);
	const [deciding, setDeciding] = useState(false);

	async function handleDecision(decision: 'approve' | 'deny') {
		setDeciding(true);
		try {
			await onDecided?.(decision);
		} finally {
			setDeciding(false);
		}
	}

	// Format JSON for display
	function formatJson(jsonStr: string): string {
		try {
			return JSON.stringify(JSON.parse(jsonStr), null, 2);
		} catch {
			return jsonStr;
		}
	}

	const isPending = status === EToolCallStatus.PENDING;
	const isExecuting = status === EToolCallStatus.EXECUTING;
	const statusColor = statusColors[status];

	return (
		<Box
			my="2"
			borderWidth="1px"
			borderColor="var(--wc-border-default)"
			borderRadius="md"
			bg="var(--wc-bg-surface)"
			overflow="hidden"
		>
			{/* Header */}
			<HStack gap="2" px="3" py="2" bg="var(--wc-bg-surface)">
				<Wrench size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)">
					{toolName}
				</Text>
				<Text fontSize="11px" color="var(--wc-text-faint)">
					{serverName}
				</Text>
				<Box flex="1" />
				<HStack gap="1">
					{isExecuting && (
						<>
							<Loader size={11} color={statusColor} className="animate-spin" />
							<Text fontSize="10px" color={statusColor}>
								{statusLabels[status]}
							</Text>
						</>
					)}
					{status === EToolCallStatus.COMPLETED && (
						<Check size={11} color={statusColor} />
					)}
					{status === EToolCallStatus.DENIED && (
						<>
							<Ban size={11} color={statusColor} />
							<Text fontSize="10px" color={statusColor}>
								{statusLabels[status]}
							</Text>
						</>
					)}
					{status === EToolCallStatus.ERROR && (
						<>
							<AlertCircle size={11} color={statusColor} />
							<Text fontSize="10px" color={statusColor}>
								{statusLabels[status]}
							</Text>
						</>
					)}
					{isPending && (
						<>
							<Box w="6px" h="6px" borderRadius="full" bg={statusColor} />
							<Text fontSize="10px" color={statusColor}>
								{statusLabels[status]}
							</Text>
						</>
					)}
				</HStack>
			</HStack>

			{/* Arguments (collapsible) */}
			<Box px="3" py="1">
				<HStack
					gap="1"
					cursor="pointer"
					onClick={() => setArgsExpanded(!argsExpanded)}
					py="1"
				>
					{argsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
					<Text fontSize="11px" color="var(--wc-text-muted)">Arguments</Text>
				</HStack>
				{argsExpanded && (
					<Box
						bg="var(--wc-overlay-dim)"
						borderRadius="sm"
						p="2"
						mb="1"
						overflow="auto"
						maxH="200px"
					>
						<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
							{formatJson(args)}
						</Text>
					</Box>
				)}
			</Box>

			{/* Result (collapsible, if available) */}
			{result && (
				<Box px="3" py="1">
					<HStack
						gap="1"
						cursor="pointer"
						onClick={() => setResultExpanded(!resultExpanded)}
						py="1"
					>
						{resultExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">Result</Text>
					</HStack>
					{resultExpanded && (
						<Box
							bg="rgba(0,0,0,0.3)"
							borderRadius="sm"
							p="2"
							mb="1"
							overflow="auto"
							maxH="300px"
						>
							<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
								{formatJson(result)}
							</Text>
						</Box>
					)}
				</Box>
			)}

			{/* Approve / Deny buttons */}
			{isPending && !deciding && (
				<HStack gap="2" px="3" py="2" justify="flex-end" borderTopWidth="1px" borderColor="var(--wc-border-subtle)">
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="var(--wc-accent-red-bg-12)"
						color="var(--wc-accent-red-alt)"
						_hover={{ bg: 'var(--wc-accent-red-hover)' }}
						onClick={() => handleDecision('deny')}
					>
						<HStack gap="1">
							<X size={12} />
							<Text fontSize="12px">Deny</Text>
						</HStack>
					</Box>
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="var(--wc-accent-green-bg-15)"
						color="var(--wc-accent-green)"
						_hover={{ bg: 'var(--wc-accent-green-hover)' }}
						onClick={() => handleDecision('approve')}
					>
						<HStack gap="1">
							<Check size={12} />
							<Text fontSize="12px">Approve</Text>
						</HStack>
					</Box>
				</HStack>
			)}

			{deciding && (
				<HStack gap="2" px="3" py="2" justify="center">
<Loader size={12} className="animate-spin" color="var(--wc-text-muted)" />
				<Text fontSize="11px" color="var(--wc-text-muted)">Processing...</Text>
				</HStack>
			)}
		</Box>
	);
}
