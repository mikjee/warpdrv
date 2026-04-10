import type { IChatMessage, IToolCall } from '@warpcore/bridge';
import { EChatRole, EMessagePartType } from '@warpcore/bridge';

export type TOpenAIMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
	tool_call_id?: string;
};

export function convertMessagesToOpenAIFormat(
	messages: IChatMessage[],
	toolCallsById: Record<string, IToolCall>,
): TOpenAIMessage[] {
	const result: TOpenAIMessage[] = [];

	for (const msg of messages) {
		switch (msg.role) {
			case EChatRole.USER: {
				const textParts = msg.content.filter(p => p.type === EMessagePartType.TEXT);
				const content = textParts.map(p => p.text || '').join('');
				result.push({ role: 'user', content });
				break;
			}

			case EChatRole.ASSISTANT: {
				const textParts = msg.content.filter(p => p.type === EMessagePartType.TEXT);
				const content = textParts.map(p => p.text || '').join('');

				const toolCallParts = msg.content.filter(p => p.type === EMessagePartType.TOOL_CALL);
				const toolCalls: TOpenAIMessage['tool_calls'] = [];

				for (const part of toolCallParts) {
					const toolCallId = (part as any).toolCallId;
					const tc = toolCallId ? toolCallsById[toolCallId] : undefined;

					if (tc) {
						toolCalls.push({
							id: tc.id,
							type: 'function',
							function: {
								name: tc.toolName,
								arguments: tc.arguments,
							},
						});
					}
				}

				const assistantMsg: TOpenAIMessage = { role: 'assistant' };

				if (content) {
					assistantMsg.content = content;
				}

				if (toolCalls.length > 0) {
					assistantMsg.tool_calls = toolCalls;
				}

				result.push(assistantMsg);
				break;
			}

			case EChatRole.TOOL: {
				const toolCallParts = msg.content.filter(p => p.type === EMessagePartType.TOOL_CALL);

				for (const part of toolCallParts) {
					const toolCallId = (part as any).toolCallId;
					const tc = toolCallId ? toolCallsById[toolCallId] : undefined;

					if (tc && tc.result !== null) {
						result.push({
							role: 'tool',
							content: tc.result,
							tool_call_id: tc.id,
						});
					}
				}
				break;
			}

			default:
				break;
		}
	}

	return result;
}
