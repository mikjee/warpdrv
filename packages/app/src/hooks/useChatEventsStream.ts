import { EventSource } from 'eventsource';
import { useEffect } from 'react';
import { useStore } from '../store';
import { setKokoroCurrentRequestId, startStream } from '../pages/Chat/assistant-ui/KokoroTTS';
import type { IBridgeEvent } from '@warpcore/bridge';

function findLastSentenceEnd(text: string): number {
	for (let i = text.length - 1; i >= 0; i--) {
		const c = text[i];
		if (c === '.' || c === '!' || c === '?') {
			if (i + 1 >= text.length || /\s/.test(text[i + 1])) {
				return i;
			}
		}
	}
	return -1;
}

export function tryAutoEmbed(messageId: string, threadId: string) {
	const s = useStore.getState();
	if (!s.selectedEmbeddingServerId) return;
	const thread = s.threads[threadId];
	if (!thread?.meta) return;
	let autoEmbed = false;
	try { autoEmbed = JSON.parse(thread.meta).enableAutoEmbed; } catch { /* ignore */ }
	if (!autoEmbed) return;
	if (s.embeddingStatusByMessage[messageId]) return;
	fetch(`/api/chat/messages/${messageId}/embed`, { method: 'POST' })
		.catch(err => useStore.getState().applyEmbeddingError(String(err)));
}

export function useChatEventsStream() {
	const applyThreadCreated = useStore(s => s.applyThreadCreated);
	const applyThreadUpdated = useStore(s => s.applyThreadUpdated);
	const applyThreadDeleted = useStore(s => s.applyThreadDeleted);
	const applyMessageCreated = useStore(s => s.applyMessageCreated);
	const applyMessagePatched = useStore(s => s.applyMessagePatched);
	const applyMessageDeleted = useStore(s => s.applyMessageDeleted);
	const applyMessageChunk = useStore(s => s.applyMessageChunk);
	const applyToolCallStarting = useStore(s => s.applyToolCallStarting);
	const applyToolCallCreated = useStore(s => s.applyToolCallCreated);
	const applyToolCallUpdated = useStore(s => s.applyToolCallUpdated);
	const applyInferenceStarted = useStore(s => s.applyInferenceStarted);
	const applyInferenceEnded = useStore(s => s.applyInferenceEnded);
	const applyInferenceError = useStore(s => s.applyInferenceError);
	const applyElicitationRequest = useStore(s => s.applyElicitationRequest);
	const applyElicitationResolved = useStore(s => s.applyElicitationResolved);
	const applyEmbeddingError = useStore(s => s.applyEmbeddingError);
	const applyEmbeddingEmbedded = useStore(s => s.applyEmbeddingEmbedded);
	const removeEmbeddingStatus = useStore(s => s.removeEmbeddingStatus);
	const applyWorkspaceStateUpdated = useStore(s => s.applyWorkspaceStateUpdated);
	const applyThreadStateUpdated = useStore(s => s.applyThreadStateUpdated);
	const applyMessageStateUpdated = useStore(s => s.applyMessageStateUpdated);

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
					if (event.message.role === 'user') {
						tryAutoEmbed(event.message.id, event.message.threadId);
					}
					break;
			case 'message.patched':
				applyMessagePatched(event.messageId, event.threadId, event.updates);
				break;
			case 'message.deleted':
				applyMessageDeleted(event.messageId, event.threadId);
				break;
case 'message.chunk':
				applyMessageChunk(event.messageId, event.threadId, event.partId, event.deltaText);
		if (event.partType === 'text') {
					const state = useStore.getState();
					const guardPass = state.ttsActiveMessageId === event.messageId && state.ttsIsGenerating === 'vad';
					//console.log('[TTS SSE] chunk: messageId=', event.messageId, 'ttsActiveMsg=', state.ttsActiveMessageId, 'generating=', state.ttsIsGenerating, 'guardPass=', guardPass);
					if (!guardPass) break;
					const msg = state.messagesByThread[event.threadId]?.[event.messageId];
					if (msg) {
						const part = msg.content.find((p: any) => p.id === event.partId);
						const buffered = state.chunksByMessageId[event.messageId]?.chunk || '';
						const fullText = (part?.text || '') + buffered;
						const spoken = state.ttsSpokenByMessage[event.messageId] || 0;
						const remaining = fullText.slice(spoken);
						const lastEnd = findLastSentenceEnd(remaining);
						if (lastEnd > -1) {
							const sentence = remaining.slice(0, lastEnd + 1);
							const reqId = useStore.getState().ttsVadRequestId;
							//console.log('[TTS SSE] calling startStream: requestId=', reqId, 'sentence=', JSON.stringify(sentence.slice(0, 60)));
							useStore.getState().ttsVadIncSent();
							startStream(
								reqId,
								sentence,
								state.settings.kokoroVoice || 'af_heart',
							).catch((err) => { console.error('[TTS SSE] startStream ERROR:', err); });
							useStore.getState().ttsSetSpokenIndex(event.messageId, spoken + lastEnd + 1);
						} else {
							console.log('[TTS SSE] no sentence boundary found in remaining text');
						}
					}
				}
				break;
			case 'tool_call.starting':
				applyToolCallStarting(event.messageId, event.name);
				break;
			case 'tool_call.created':
				applyToolCallCreated(event.toolCall);
				break;
			case 'tool_call.updated':
				applyToolCallUpdated(event.toolCall);
				break;
			case 'inference.started':
				applyInferenceStarted(event.threadId, event.messageId);
				{
					const s = useStore.getState();
					//console.log('[TTS SSE] inference.started: vadActive=', s.vadActive, 'messageId=', event.messageId);
					if (!s.vadActive) { break; }
					s.ttsSetSpokenIndex(event.messageId, 0);
					s.ttsVadReset();
					const newId = s.ttsVadNewRequestId();
					setKokoroCurrentRequestId(newId);
					s.ttsStart(event.messageId, 'vad');
				}
				break;
case 'inference.ended':
				applyInferenceEnded(event.threadId, event.messageId);
				tryAutoEmbed(event.messageId, event.threadId);
				const vadActive = useStore.getState().vadActive;
				//console.log('[TTS SSE] inference.ended: vadActive=', vadActive);
				if (vadActive) {
					useStore.getState().ttsClearSpokenIndex(event.messageId);
				}
				break;
			case 'inference.error':
				applyInferenceError(event.threadId, event.messageId, event.error);
				break;
			case 'elicitation_request':
				applyElicitationRequest(event.threadId, event.request);
				break;
			case 'elicitation_resolved':
				applyElicitationResolved(event.id);
				break;
			case 'embedding.error':
				applyEmbeddingError(event.error);
				break;
			case 'embedding.embedded':
				{
					const state = useStore.getState();
					const selectedServerId = state.selectedEmbeddingServerId;
					const selectedServer = selectedServerId ? state.servers[selectedServerId] : null;
					if (selectedServer?.modelPath === event.modelId && event.topic === 'global' && state.currentThreadId === event.threadId) {
						applyEmbeddingEmbedded(event.messageId);
					}
				}
				break;
			case 'embedding.removed':
				{
					const state = useStore.getState();
					const selectedServerId = state.selectedEmbeddingServerId;
					const selectedServer = selectedServerId ? state.servers[selectedServerId] : null;
					if (selectedServer?.modelPath === event.modelId && event.topic === 'global') {
						removeEmbeddingStatus(event.messageId);
					}
				}
				break;
			case 'workspace_state.updated':
				applyWorkspaceStateUpdated(event.folderId, event.data);
				break;
			case 'thread_state.updated':
				applyThreadStateUpdated(event.threadId, event.data);
				break;
			case 'message_state.updated':
				applyMessageStateUpdated(event.messageId, event.data);
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
		es.addEventListener('tool_call.starting', handleEvent);
		es.addEventListener('tool_call.created', handleEvent);
		es.addEventListener('tool_call.updated', handleEvent);
		es.addEventListener('inference.started', handleEvent);
		es.addEventListener('inference.ended', handleEvent);
		es.addEventListener('inference.error', handleEvent);
		es.addEventListener('elicitation_request', handleEvent);
		es.addEventListener('elicitation_resolved', handleEvent);
		es.addEventListener('embedding.error', handleEvent);
		es.addEventListener('embedding.embedded', handleEvent);
		es.addEventListener('embedding.removed', handleEvent);
		es.addEventListener('workspace_state.updated', handleEvent);
		es.addEventListener('thread_state.updated', handleEvent);
		es.addEventListener('message_state.updated', handleEvent);
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
		applyToolCallStarting,
		applyToolCallCreated,
		applyToolCallUpdated,
		applyInferenceStarted,
		applyInferenceEnded,
		applyInferenceError,
		applyElicitationRequest,
		applyElicitationResolved,
applyEmbeddingError,
				applyEmbeddingEmbedded,
				removeEmbeddingStatus,
				applyWorkspaceStateUpdated,
				applyThreadStateUpdated,
				applyMessageStateUpdated,
			]);
}
