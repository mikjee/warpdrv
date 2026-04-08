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

// Map assistant-ui status back to EToolCallStatus
function mapStatusBack(status: 'complete' | 'running' | 'requires-action' | 'error'): EToolCallStatus {
	switch (status) {
		case 'complete': return EToolCallStatus.COMPLETED;
		case 'running': return EToolCallStatus.EXECUTING;
		case 'requires-action': return EToolCallStatus.PENDING;
		case 'error': return EToolCallStatus.ERROR;
		default: return EToolCallStatus.COMPLETED;
	}
}

export function ToolCallBlockWrapper({ toolCallId, toolName, serverName, args, result, status }: IToolCallBlockWrapperProps) {
	const {
		currentThreadId,
		currentServerId,
		currentSystemPrompt,
		currentInferenceParams,
	} = useStore(s => ({
		currentThreadId: s.currentThreadId,
		currentServerId: s.currentServerId,
		currentSystemPrompt: s.currentSystemPrompt,
		currentInferenceParams: s.currentInferenceParams,
	}));

	async function handleDecision(decision: 'approve' | 'deny') {
		if (!currentThreadId || !currentServerId) return;

		const { decideMcpToolCall } = await import('@/api/mcpServices');
		await decideMcpToolCall(
			decision,
			currentThreadId,
			currentServerId,
			undefined,
			currentSystemPrompt,
			currentInferenceParams
		);
	}

	return (
		<ToolCallBlock
			id={toolCallId}
			serverName={serverName ?? 'unknown'}
			toolName={toolName}
			arguments={JSON.stringify(args)}
			result={result ? JSON.stringify(result) : undefined}
			status={mapStatusBack(status)}
			onDecided={() => handleDecision('approve')}
		/>
	);
}
