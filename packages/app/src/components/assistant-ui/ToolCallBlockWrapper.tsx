import { ToolCallBlock } from '@/components/ToolCallBlock';
import { useStore } from '@/store';
import { EToolCallStatus } from '@warpcore/bridge';

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
	const currentServerId = useStore(s => s.currentServerId);
	const currentSystemPrompt = useStore(s => s.currentSystemPrompt);
	const currentInferenceParams = useStore(s => s.currentInferenceParams);

	async function handleDecision(decision: 'approve' | 'deny') {
		if (!currentThreadId || !currentServerId) return;

		const { decideMcpToolCall } = await import('@/api/mcpServices');
		await decideMcpToolCall(
			toolCallId,
			decision,
			currentThreadId,
			currentServerId,
			undefined,
			currentSystemPrompt,
			currentInferenceParams
		);
	}

	// Map status for display
	const displayStatus: EToolCallStatus = status === 'requires-action'
		? EToolCallStatus.PENDING
		: status === 'running'
		? EToolCallStatus.EXECUTING
		: status === 'error'
		? EToolCallStatus.ERROR
		: EToolCallStatus.COMPLETED;

	return (
		<ToolCallBlock
			id={toolCallId}
			serverName={serverName ?? 'unknown'}
			toolName={toolName}
			arguments={JSON.stringify(args)}
			result={result ? JSON.stringify(result) : undefined}
			status={displayStatus}
			onDecided={handleDecision}
		/>
	);
}
