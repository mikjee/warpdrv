import React, { useState, useContext, useCallback, useMemo } from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { Wrench, Check, Ban, Loader, AlertCircle, X, Lock } from 'lucide-react';
import { ToolCallBlock } from '@/pages/Chat/assistant-ui/ToolCallBlock';
import { useStore } from '@/store';
import { EToolCallStatus, EToolApprovalMode } from '@warpcore/bridge';
import { ServerStatusContext } from './thread';
import { autoResolveRenderer } from './tool-renderers/resolver';
import { RendererErrorBoundary } from './tool-renderers/RendererErrorBoundary';
import { useToast } from '@/components/ToastProvider';
import { decideMcpToolCall, setThreadToolPermission, fetchThreadPermissions } from '@/api/mcpServices';

interface IToolCallBlockWrapperProps {
	toolCallId: string;
	toolName: string;
	serverName?: string;
	args: Record<string, unknown>;
	result?: unknown;
	status: 'complete' | 'running' | 'requires-action' | 'error';
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

export const ToolCallBlockWrapper = React.memo(({ toolCallId, toolName, serverName, args, result, status }: IToolCallBlockWrapperProps) => {
	const currentThreadId = useStore(s => s.currentThreadId);
	const { currentServerId } = useContext(ServerStatusContext);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams);
	const toolCall = useStore(s => s.toolCallsById[toolCallId]);
	const serverState = useStore(s => serverName ? s.mcpServers[serverName] : undefined);
	const toolCallRenderers = useStore(s => s.toolCallRenderers);
	const attachAllTools = useStore(s => s.attachAllTools);
	const attachedTools = useStore(s => s.attachedTools);
	const [deciding, setDeciding] = useState(false);
	const toast = useToast();

	const handleDecision = useCallback(async (decision: 'approve' | 'deny') => {
		if (!currentThreadId || !currentServerId) return;
		setDeciding(true);
		try {
			await decideMcpToolCall(
				toolCallId, decision, currentThreadId, currentServerId,
				currentSystemPrompt, currentInferenceParams,
				undefined,
				attachAllTools,
				attachedTools
			);
		} finally {
			setDeciding(false);
		}
	}, [toolCallId, currentThreadId, currentServerId, currentSystemPrompt, currentInferenceParams, attachAllTools, attachedTools]);

	const handleAlwaysApprove = useCallback(async () => {
		if (!currentThreadId || !currentServerId || !serverName) return;
		setDeciding(true);
		try {
			await setThreadToolPermission(currentThreadId, serverName, toolName, true, EToolApprovalMode.ALLOWED);
			const res = await fetchThreadPermissions(currentThreadId);
			if (res.ok) useStore.getState().setThreadToolPermissions(currentThreadId, res.data.threadOverrides);
			await decideMcpToolCall(
				toolCallId, 'approve', currentThreadId, currentServerId,
				currentSystemPrompt, currentInferenceParams,
				undefined,
				attachAllTools,
				attachedTools
			);
			toast({ title: `"${toolName}" will always be approved for this thread`, status: 'success', duration: 3000 });
		} finally {
			setDeciding(false);
		}
	}, [toolCallId, toolName, serverName, currentThreadId, currentServerId, currentSystemPrompt, currentInferenceParams, attachAllTools, attachedTools, toast]);


	const displayStatus: EToolCallStatus = toolCall?.status ?? (
		status === 'requires-action'
			? EToolCallStatus.PENDING
			: status === 'running'
				? EToolCallStatus.EXECUTING
				: status === 'error'
					? EToolCallStatus.ERROR
					: EToolCallStatus.COMPLETED
	);

	const isPending = displayStatus === EToolCallStatus.PENDING;
	const isExecuting = displayStatus === EToolCallStatus.EXECUTING;
	const statusColor = statusColors[displayStatus];

	const body = useMemo(() => {
		const fallback = <ToolCallBlock args={JSON.stringify(args)} result={result ? JSON.stringify(result) : undefined} />;
		// Priority 1: explicit mcp.json renderer config
		const rendererCfg = serverState?.warpdrv?.renderers?.[toolName];
		const ExplicitComponent = rendererCfg ? toolCallRenderers[rendererCfg.component]?.component : undefined;
		if (rendererCfg && ExplicitComponent) {
			const mappedArgs: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(args)) {
				const targetKey = rendererCfg.propsMap?.[k] ?? k;
				mappedArgs[targetKey] = v;
			}
			return (
				<RendererErrorBoundary fallback={fallback}>
					<ExplicitComponent {...mappedArgs} {...(rendererCfg.props ?? {})} result={result} />
				</RendererErrorBoundary>
			);
		}
		// Priority 2: auto-match via keywords + canRender
		const resolved = autoResolveRenderer(toolName, args, toolCallRenderers);
		if (resolved) {
			const { component: AutoComponent, props } = resolved;
			return (
				<RendererErrorBoundary fallback={fallback}>
					<AutoComponent {...props} result={result} />
				</RendererErrorBoundary>
			);
		}
		// Priority 3: default fallback
		return fallback;
	}, [serverState, toolName, toolCallRenderers, args, result]);

	return (
		<Box my="2" borderWidth="1px" borderColor="var(--wc-border-default)" borderRadius="lg" bg="var(--wc-bg-surface)" overflow="hidden">
			<HStack gap="2" px="3" py="2" bg="var(--wc-bg-surface)">
				<Wrench size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)">{toolName}</Text>
				<Text fontSize="11px" color="var(--wc-text-faint)">{serverName}</Text>
				<Box flex="1" />
				<HStack gap="1">
					{isExecuting && (
						<>
							<Loader size={11} color={statusColor} className="animate-spin" />
							<Text fontSize="10px" color={statusColor}>{statusLabels[displayStatus]}</Text>
						</>
					)}
					{displayStatus === EToolCallStatus.COMPLETED && <Check size={11} color={statusColor} />}
					{displayStatus === EToolCallStatus.DENIED && (
						<>
							<Ban size={11} color={statusColor} />
							<Text fontSize="10px" color={statusColor}>{statusLabels[displayStatus]}</Text>
						</>
					)}
					{displayStatus === EToolCallStatus.ERROR && (
						<>
							<AlertCircle size={11} color={statusColor} />
							<Text fontSize="10px" color={statusColor}>{statusLabels[displayStatus]}</Text>
						</>
					)}
					{isPending && (
						<>
							<Box w="6px" h="6px" borderRadius="full" bg={statusColor} />
							<Text fontSize="10px" color={statusColor}>{statusLabels[displayStatus]}</Text>
						</>
					)}
				</HStack>
			</HStack>

			{displayStatus === EToolCallStatus.ERROR && toolCall?.error && (
				<Box px="3" py="2" borderTopWidth="1px" borderColor="var(--wc-border-subtle)">
					<Text fontSize="11px" color="var(--wc-accent-red)" whiteSpace="pre-wrap" wordBreak="break-word">{toolCall.error}</Text>
				</Box>
			)}

			{body}

			{isPending && !deciding && (
				<HStack gap="2" px="3" py="2" justify="flex-end" borderTopWidth="1px" borderColor="var(--wc-border-subtle)">
					<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-green-bg-15)" color="var(--wc-accent-green)" _hover={{ bg: 'var(--wc-accent-green-hover)' }} onClick={() => handleDecision('approve')}>
						<HStack gap="1"><Check size={12} /><Text fontSize="12px">Allow Once</Text></HStack>
					</Box>
					<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-yellow-bg-8)" color="var(--wc-accent-yellow-strong)" _hover={{ bg: 'var(--wc-accent-yellow-hover-bg)' }} onClick={() => handleAlwaysApprove()}>
						<HStack gap="1"><Lock size={12} /><Text fontSize="12px">Allow Always</Text></HStack>
					</Box>
					<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-red-bg-12)" color="var(--wc-accent-red-alt)" _hover={{ bg: 'var(--wc-accent-red-hover)' }} onClick={() => handleDecision('deny')}>
						<HStack gap="1"><X size={12} /><Text fontSize="12px">Deny</Text></HStack>
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
});