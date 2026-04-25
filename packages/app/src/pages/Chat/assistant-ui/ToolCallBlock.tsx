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
	[EToolCallStatus.PENDING]: '#f59e0b',
	[EToolCallStatus.DENIED]: '#ef4444',
	[EToolCallStatus.EXECUTING]: '#3b82f6',
	[EToolCallStatus.COMPLETED]: '#22c55e',
	[EToolCallStatus.ERROR]: '#ef4444',
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
			borderColor="rgba(255,255,255,0.08)"
			borderRadius="md"
			bg="rgba(255,255,255,0.02)"
			overflow="hidden"
		>
			{/* Header */}
			<HStack gap="2" px="3" py="2" bg="rgba(255,255,255,0.02)">
				<Wrench size={13} color="rgba(255,255,255,0.5)" />
				<Text fontSize="12px" fontWeight="500" color="rgba(255,255,255,0.8)">
					{toolName}
				</Text>
				<Text fontSize="11px" color="rgba(255,255,255,0.3)">
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
					<Text fontSize="11px" color="rgba(255,255,255,0.4)">Arguments</Text>
				</HStack>
				{argsExpanded && (
					<Box
						bg="rgba(0,0,0,0.3)"
						borderRadius="sm"
						p="2"
						mb="1"
						overflow="auto"
						maxH="200px"
					>
						<Text fontSize="11px" fontFamily="mono" color="rgba(255,255,255,0.6)" whiteSpace="pre-wrap">
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
						<Text fontSize="11px" color="rgba(255,255,255,0.4)">Result</Text>
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
							<Text fontSize="11px" fontFamily="mono" color="rgba(255,255,255,0.6)" whiteSpace="pre-wrap">
								{formatJson(result)}
							</Text>
						</Box>
					)}
				</Box>
			)}

			{/* Approve / Deny buttons */}
			{isPending && !deciding && (
				<HStack gap="2" px="3" py="2" justify="flex-end" borderTopWidth="1px" borderColor="rgba(255,255,255,0.05)">
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="rgba(239,68,68,0.15)"
						color="rgba(239,68,68,0.9)"
						_hover={{ bg: 'rgba(239,68,68,0.25)' }}
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
						bg="rgba(34,197,94,0.15)"
						color="rgba(34,197,94,0.9)"
						_hover={{ bg: 'rgba(34,197,94,0.25)' }}
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
					<Loader size={12} className="animate-spin" color="rgba(255,255,255,0.4)" />
					<Text fontSize="11px" color="rgba(255,255,255,0.4)">Processing...</Text>
				</HStack>
			)}
		</Box>
	);
}
