import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useStore } from '../store';
import type { IBridgeEvent } from '@warpcore/bridge';

export function useChatEventsStream() {
	const applyThreadCreated = useStore(s => s.applyThreadCreated);
	const applyThreadUpdated = useStore(s => s.applyThreadUpdated);
	const applyThreadDeleted = useStore(s => s.applyThreadDeleted);
	const applyMessageCreated = useStore(s => s.applyMessageCreated);
	const applyMessagePatched = useStore(s => s.applyMessagePatched);
	const applyMessageDeleted = useStore(s => s.applyMessageDeleted);
	const applyMessageChunk = useStore(s => s.applyMessageChunk);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	const applyToolCallUpdated = useStore(s => s.applyToolCallUpdated);
	const applyInferenceStarted = useStore(s => s.applyInferenceStarted);
	const applyInferenceEnded = useStore(s => s.applyInferenceEnded);
	const applyInferenceError = useStore(s => s.applyInferenceError);

	useEffect(() => {
		console.log('[Chat SSE] Creating EventSource connection to /api/chat/events');
		const es = new EventSource('/api/chat/events');

		es.onopen = () => {
			console.log('[Chat SSE] ✅ Connection opened successfully');
		};

		const handleEvent = (e: MessageEvent) => {
			const event = JSON.parse(e.data) as IBridgeEvent;
			switch (event.type) {
				case 'thread.created':
					applyThreadCreated(event.thread);
					break;
			case 'thread.updated':
				applyThreadUpdated(event.threadId, event.updates);
				break;
			case 'thread.deleted':
				applyThreadDeleted(event.threadId);
				break;
			case 'message.created':
					applyMessageCreated(event.message);
					break;
			case 'message.patched':
				applyMessagePatched(event.messageId, event.threadId, event.updates);
				break;
			case 'message.deleted':
				applyMessageDeleted(event.messageId, event.threadId);
				break;
			case 'message.chunk':
				applyMessageChunk(event.messageId, event.threadId, event.partId, event.deltaText);
				break;
			case 'tool_call.created':
				applyToolCallCreated(event.toolCall);
				break;
			case 'tool_call.updated':
				applyToolCallUpdated(event.toolCall);
				break;
			case 'inference.started':
				applyInferenceStarted(event.threadId, event.messageId);
				break;
			case 'inference.ended':
				applyInferenceEnded(event.threadId, event.messageId);
				break;
			case 'inference.error':
				applyInferenceError(event.threadId, event.messageId, event.error);
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
		es.addEventListener('inference.error', handleEvent);

		es.onerror = (err) => {
			console.error('[Chat SSE] ❌ Connection error:', err);
		};

		return () => {
			console.log('[Chat SSE] Cleaning up EventSource connection');
			es.close();
		};
	}, [
		applyThreadCreated,
		applyThreadUpdated,
		applyThreadDeleted,
		applyMessageCreated,
		applyMessagePatched,
		applyMessageDeleted,
		applyMessageChunk,
		applyToolCallCreated,
		applyToolCallUpdated,
		applyInferenceStarted,
		applyInferenceEnded,
		applyInferenceError,
	]);
}
