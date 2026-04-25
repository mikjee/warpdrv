import http from 'http';
import type {
	ISlotLiveState,
	IServerSlotsState,
	TServerId,
	TSlotId,
	TTaskId,
} from '@warpcore/shared';
import { SSE_CHANNELS_CHECKPOINT } from '@warpcore/shared';
import { sseManager } from './sseManagerInstance';

// In-memory state per server
const serversState: Record<TServerId, IServerSlotsState> = {};

// Bootstrap: read GET /slots once and seed the map
export async function bootstrapServer(serverId: TServerId, port: number): Promise<void> {
	const maxRetries = 5;
	const retryDelay = 300;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const slots = await fetchSlotsSnapshot(port);
		if (slots != null) {
			const liveSlots: ISlotLiveState[] = slots.sort((a, b) => a.id - b.id).map(s => ({
				slotId: s.id,
				isProcessing: s.is_processing,
				taskId: s.id_task ?? null,
				promptTokens: 0,
				generatedTokens: s.next_token?.[0]?.n_decoded ?? 0,
				cachedTokens: s.next_token?.[0]?.n_decoded ?? 0,
				prefillProgress: null,
				nCtx: s.n_ctx,
				lastActivityAt: Date.now(),
			}));
			serversState[serverId] = { serverId, slots: liveSlots, metadata: {} };
			emitSnapshot(serverId);
			return;
		}
		if (attempt < maxRetries - 1) {
			await new Promise(r => setTimeout(r, retryDelay));
		}
	}
	console.warn(`[slotStateTracker] Failed to fetch slots for ${serverId} after ${maxRetries} attempts`);
	serversState[serverId] = { serverId, slots: [], metadata: {} };
}

// Tear down state when server stops
export function teardownServer(serverId: TServerId): void {
	delete serversState[serverId];
}

// Read accessors
export function getServerSlots(serverId: TServerId): IServerSlotsState | null {
	return serversState[serverId] ?? null;
}

export function getAllServerSlots(): Record<TServerId, IServerSlotsState> {
	return { ...serversState };
}

// Parse a single log line and update state if it matches a known pattern
export function parseLogLine(serverId: TServerId, line: string): void {
	const state = serversState[serverId];
	if (state == null) return;

	// launch_slot_: id N | task M | processing task
	const launchMatch = line.match(/launch_slot_:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*processing task/);
	if (launchMatch) {
		const slotId = parseInt(launchMatch[1]!, 10);
		const taskId = parseInt(launchMatch[2]!, 10);
		updateSlot(serverId, slotId, {
			isProcessing: true,
			taskId,
			promptTokens: 0,
			generatedTokens: 0,
			prefillProgress: 0,
			lastActivityAt: Date.now(),
		});
		return;
	}

	// update_slots: id N | task M | new prompt, n_ctx_slot = X, n_keep = Y, task.n_tokens = Z
	const newPromptMatch = line.match(/update_slots:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*new prompt,\s*n_ctx_slot\s*=\s*(\d+),\s*n_keep\s*=\s*\d+,\s*task\.n_tokens\s*=\s*(\d+)/);
	if (newPromptMatch) {
		const slotId = parseInt(newPromptMatch[1]!, 10);
		const taskId = parseInt(newPromptMatch[2]!, 10);
		const nCtx = parseInt(newPromptMatch[3]!, 10);
		const promptTokens = parseInt(newPromptMatch[4]!, 10);
		updateSlot(serverId, slotId, {
			isProcessing: true,
			taskId,
			promptTokens,
			nCtx,
			lastActivityAt: Date.now(),
		});
		return;
	}

	// update_slots: id N | task M | prompt processing progress, n_tokens = X, batch.n_tokens = Y, progress = Z
	const progressMatch = line.match(/update_slots:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*prompt processing progress,\s*n_tokens\s*=\s*\d+,\s*batch\.n_tokens\s*=\s*\d+,\s*progress\s*=\s*([\d.]+)/);
	if (progressMatch) {
		const slotId = parseInt(progressMatch[1]!, 10);
		const progress = parseFloat(progressMatch[3]!);
		updateSlot(serverId, slotId, {
			prefillProgress: progress,
			lastActivityAt: Date.now(),
		});
		return;
	}

	// update_slots: id N | task M | prompt processing done, n_tokens = X, batch.n_tokens = Y
	const doneMatch = line.match(/update_slots:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*prompt processing done/);
	if (doneMatch) {
		const slotId = parseInt(doneMatch[1]!, 10);
		updateSlot(serverId, slotId, {
			prefillProgress: null,
			lastActivityAt: Date.now(),
		});
		return;
	}

	// process_token: id N | task M | n_decoded = X, n_remaining = Y, ...
	const tokenMatch = line.match(/process_token:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*n_decoded\s*=\s*(\d+),\s*n_remaining\s*=\s*(-?\d+)/);
	if (tokenMatch) {
		const slotId = parseInt(tokenMatch[1]!, 10);
		const nDecoded = parseInt(tokenMatch[3]!, 10);
		const slot = state.slots.find(s => s.slotId === slotId);
		const cachedBase = slot ? slot.promptTokens : 0;
		updateSlot(serverId, slotId, {
			generatedTokens: nDecoded,
			cachedTokens: cachedBase + nDecoded,
			prefillProgress: null,
			lastActivityAt: Date.now(),
		});
		return;
	}

	// release: id N | task M | stop processing: n_tokens = X, truncated = Y
	const releaseMatch = line.match(/release:\s*id\s+(\d+)\s*\|\s*task\s+(\d+)\s*\|\s*stop processing/);
	if (releaseMatch) {
		const slotId = parseInt(releaseMatch[1]!, 10);
		updateSlot(serverId, slotId, {
			isProcessing: false,
			prefillProgress: null,
			lastActivityAt: Date.now(),
		});
		return;
	}
}

// Apply a partial update to a slot, creating it if missing, then emit SSE
function updateSlot(serverId: TServerId, slotId: TSlotId, patch: Partial<ISlotLiveState>): void {
	const state = serversState[serverId];
	if (state == null) return;
	let slot = state.slots.find(s => s.slotId === slotId);
	if (slot == null) {
		slot = {
			slotId,
			isProcessing: false,
			taskId: null,
			promptTokens: 0,
			generatedTokens: 0,
			cachedTokens: 0,
			prefillProgress: null,
			nCtx: 0,
			lastActivityAt: Date.now(),
		};
		state.slots.push(slot);
	}
	Object.assign(slot, patch);
	sseManager.emit(SSE_CHANNELS_CHECKPOINT.SLOT_STATE, { serverId, state: slot });
}

function emitSnapshot(serverId: TServerId): void {
	const state = serversState[serverId];
	if (state == null) return;
	sseManager.emit(SSE_CHANNELS_CHECKPOINT.SERVER_SLOTS_SNAPSHOT, { snapshot: state });
}

// HTTP helper - GET /slots from llama-server
interface ISlotsApiSlot {
	id: TSlotId;
	id_task?: TTaskId | null;
	is_processing: boolean;
	n_ctx: number;
	next_token?: Array<{ n_decoded?: number; n_remain?: number }>;
}

function fetchSlotsSnapshot(port: number): Promise<ISlotsApiSlot[] | null> {
	return new Promise((resolve) => {
		const req = http.get({ host: '127.0.0.1', port, path: '/slots', timeout: 5000 }, (res) => {
			if (res.statusCode !== 200) { resolve(null); return; }
			let body = '';
			res.on('data', (c) => { body += c; });
			res.on('end', () => {
				try { resolve(JSON.parse(body) as ISlotsApiSlot[]); }
				catch { resolve(null); }
			});
		});
		req.on('error', () => resolve(null));
		req.on('timeout', () => { req.destroy(); resolve(null); });
	});
}
