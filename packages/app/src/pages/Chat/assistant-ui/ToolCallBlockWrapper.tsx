import { ToolCallBlock } from '@/pages/Chat/assistant-ui/ToolCallBlock';
import { useStore } from '@/store';
import { EToolCallStatus } from '@warpcore/bridge';
import { useContext } from 'react';
import { ServerStatusContext } from './thread';

interface IToolCallBlockWrapperProps {
	toolCallId: string;
	toolName: string;
	serverName?: string;
	args: Record<string, unknown>;
	result?: unknown;
	status: 'complete' | 'running' | 'requires-action' | 'error';
}

export function ToolCallBlockWrapper({ toolCallId, toolName, serverName, args, result, status }: IToolCallBlockWrapperProps) {
	const currentThreadId = useStore(s => s.currentThreadId);
	const { currentServerId } = useContext(ServerStatusContext);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams);
	const toolCall = useStore(s => s.toolCallsById[toolCallId]);

	async function handleDecisionV2(decision: 'approve' | 'deny') {
		if (!currentThreadId || !currentServerId) return;

		const { decideMcpToolCall } = await import('@/api/mcpServices');
		await decideMcpToolCall(
			toolCallId,
			decision,
			currentThreadId,
			currentServerId,
			currentSystemPrompt,
			currentInferenceParams
		);
	}

	// Use actual status from store, fallback to mapped status if not available
	const displayStatus: EToolCallStatus = toolCall?.status ?? (
		status === 'requires-action'
			? EToolCallStatus.PENDING
			: status === 'running'
			? EToolCallStatus.EXECUTING
			: status === 'error'
			? EToolCallStatus.ERROR
			: EToolCallStatus.COMPLETED
	);

	return (
		<ToolCallBlock
			id={toolCallId}
			serverName={serverName ?? 'unknown'}
			toolName={toolName}
			arguments={JSON.stringify(args)}
			result={result ? JSON.stringify(result) : undefined}
			status={displayStatus}
			onDecided={handleDecisionV2}
		/>
	);
}
