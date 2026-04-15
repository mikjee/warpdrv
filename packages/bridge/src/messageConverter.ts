// ============================================================
// warpbridge/src/messageConverter.ts
// Message conversion utilities - universal (no Node/browser deps)
// ============================================================

import type { IChatMessage, IToolCall } from './types';
import { EChatRole, EMessagePartType } from './types';

export type TOpenAIMessage = {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content?: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
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
				const attachmentParts = msg.content.filter(p => p.type === EMessagePartType.ATTACHMENT);
				
				if (attachmentParts.length === 0) {
					const content = textParts.map(p => p.text || '').join('');
					result.push({ role: 'user', content });
				} else {
					const contentArray: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
					
					for (const part of textParts) {
						if (part.text) contentArray.push({ type: 'text', text: part.text });
					}
					
					for (const att of attachmentParts) {
						if (att.mimeType.startsWith('image/')) {
							const dataUrl = att.data.startsWith('data:') ? att.data : `data:${att.mimeType};base64,${att.data}`;
							contentArray.push({ type: 'image_url', image_url: { url: dataUrl } });
						} else {
							contentArray.push({ type: 'text', text: att.data });
						}
					}
					
					result.push({ role: 'user', content: contentArray });
				}
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
