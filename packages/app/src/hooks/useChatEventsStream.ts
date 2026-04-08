import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useStore } from '../store';
import type { IBridgeEvent } from '@warpcore/bridge';

export function useChatEventsStream() {
	const apply = useStore(s => ({
		applyThreadCreated: s.applyThreadCreated,
		applyThreadUpdated: s.applyThreadUpdated,
		applyThreadDeleted: s.applyThreadDeleted,
		applyMessageCreated: s.applyMessageCreated,
		applyMessagePatched: s.applyMessagePatched,
		applyMessageDeleted: s.applyMessageDeleted,
		applyMessageChunk: s.applyMessageChunk,
		applyToolCallCreated: s.applyToolCallCreated,
		applyToolCallUpdated: s.applyToolCallUpdated,
		applyInferenceStarted: s.applyInferenceStarted,
		applyInferenceEnded: s.applyInferenceEnded,
	}));

	useEffect(() => {
		const es = new EventSource('/api/chat/events');

		const handleEvent = (e: MessageEvent) => {
			const event = JSON.parse(e.data) as IBridgeEvent;
			switch (event.type) {
				case 'thread.created':
					apply.applyThreadCreated(event.thread);
					break;
			case 'thread.updated':
				apply.applyThreadUpdated(event.threadId, event.updates);
				break;
			case 'thread.deleted':
				apply.applyThreadDeleted(event.threadId);
				break;
			case 'message.created':
					apply.applyMessageCreated(event.message);
					break;
			case 'message.patched':
				apply.applyMessagePatched(event.messageId, event.threadId, event.updates);
				break;
			case 'message.deleted':
				apply.applyMessageDeleted(event.messageId, event.threadId);
				break;
			case 'message.chunk':
					apply.applyMessageChunk(event.messageId, event.threadId, event.partId, event.deltaText);
					break;
				case 'tool_call.created':
					apply.applyToolCallCreated(event.toolCall);
					break;
				case 'tool_call.updated':
					apply.applyToolCallUpdated(event.toolCall);
					break;
				case 'inference.started':
					apply.applyInferenceStarted(event.threadId, event.messageId);
					break;
				case 'inference.ended':
					apply.applyInferenceEnded(event.threadId, event.messageId);
					break;
				default:
					// Unknown event type, ignore
					break;
			}
		};

		// Register listeners per event type
		es.addEventListener('thread.created', handleEvent);
		es.addEventListener('thread.updated', handleEvent);
		es.addEventListener('thread.deleted', handleEvent);
		es.addEventListener('message.created', handleEvent);
		es.addEventListener('message.patched', handleEvent);
		es.addEventListener('message.deleted', handleEvent);
		es.addEventListener('message.chunk', handleEvent);
		es.addEventListener('tool_call.created', handleEvent);
		es.addEventListener('tool_call.updated', handleEvent);
		es.addEventListener('inference.started', handleEvent);
		es.addEventListener('inference.ended', handleEvent);

		es.onerror = (err) => {
			console.error('[ChatEventsStream] error', err);
			// EventSource auto-reconnects by default
		};

		return () => {
			es.close();
		};
	}, [apply]);
}
