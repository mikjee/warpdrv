import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import http from 'http';
import { store } from '../util/store';
import type {
	ICheckpoint,
	ICheckpointFingerprint,
	ISaveCheckpointRequest,
	ISaveCheckpointResponse,
	IRestoreCheckpointRequest,
	IRestoreCheckpointResponse,
	IRestoreCheckpointsMappedRequest,
	IListCheckpointsQuery,
	IFingerprintMismatch,
	IServer,
	ISettings,
	TCheckpointId,
	TBundleId,
	TServerId,
	TSlotId,
	TFingerprintHash,
} from '@warpcore/shared';
import { ECheckpointSaveMode, DEFAULT_SETTINGS } from '@warpcore/shared';

const SETTINGS_KEY = 'settings:general';
const SERVERS_PREFIX = 'servers:';
const PREVIEW_MAX_CHARS = 200;

// Resolve the checkpoints directory (configurable via settings)
export async function getCheckpointsDir(): Promise<string> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const configured = (settings as ISettings & { checkpointsPath?: string }).checkpointsPath;
	const dir = configured && configured.trim().length > 0
		? configured
		: path.join(os.homedir(), '.config', 'warpcore', 'checkpoints');
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	return dir;
}

// Compose deterministic fingerprint hash from filename + size
function computeFingerprintHash(fp: ICheckpointFingerprint): TFingerprintHash {
	const raw = `${fp.modelFilename}:${fp.modelSizeBytes}`;
	return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

// Build fingerprint by reading the model file on disk
function buildFingerprint(modelPath: string): ICheckpointFingerprint {
	const stat = fs.statSync(modelPath);
	return {
		modelFilename: path.basename(modelPath),
		modelSizeBytes: stat.size,
	};
}

// Compose the checkpoint id: <fingerprintHash>-<timestamp>-<slotIndex>
function composeCheckpointId(hash: TFingerprintHash, createdAt: number, slotIndex: TSlotId): TCheckpointId {
	return `${hash}-${createdAt}-${slotIndex}`;
}

function sidecarPath(dir: string, id: TCheckpointId): string {
	return path.join(dir, `${id}.json`);
}

function binPath(dir: string, id: TCheckpointId): string {
	return path.join(dir, `${id}.bin`);
}

// Truncate a string to PREVIEW_MAX_CHARS characters
function truncatePreview(text: string | null): string | null {
	if (text == null) return null;
	return text.length > PREVIEW_MAX_CHARS ? text.slice(0, PREVIEW_MAX_CHARS) : text;
}

// HTTP helper - POST to llama-server
function httpPostJson(port: number, urlPath: string, body: unknown): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify(body);
		const req = http.request({
			host: '127.0.0.1',
			port,
			path: urlPath,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(data),
			},
			timeout: 60000,
		}, (res) => {
			let chunks = '';
			res.on('data', (c) => { chunks += c; });
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }));
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(new Error('llama-server request timeout')); });
		req.write(data);
		req.end();
	});
}

// HTTP helper - GET from llama-server
function httpGetJson(port: number, urlPath: string): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const req = http.get({
			host: '127.0.0.1',
			port,
			path: urlPath,
			timeout: 10000,
		}, (res) => {
			let chunks = '';
			res.on('data', (c) => { chunks += c; });
			res.on('end', () => resolve({ status: res.statusCode ?? 0, body: chunks }));
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(new Error('llama-server request timeout')); });
	});
}

// Read a sidecar JSON file
function readSidecar(filePath: string): ICheckpoint | null {
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		return JSON.parse(raw) as ICheckpoint;
	} catch {
		return null;
	}
}

// Write a sidecar JSON file
function writeSidecar(filePath: string, data: ICheckpoint): void {
	fs.writeFileSync(filePath, JSON.stringify(data, null, '\t'), 'utf8');
}

// Save checkpoints for one or more slots on a server
export async function saveCheckpoint(req: ISaveCheckpointRequest): Promise<ISaveCheckpointResponse> {
	const server = await store.get<IServer>(`${SERVERS_PREFIX}${req.serverId}`);
	if (!server) throw new Error(`Server not found: ${req.serverId}`);

	// Determine slot list - null means all slots
	let slotIds: TSlotId[];
	if (req.slotIds && req.slotIds.length > 0) {
		slotIds = req.slotIds;
	} else {
		const slotsRes = await httpGetJson(server.port, '/slots');
		if (slotsRes.status !== 200) throw new Error(`GET /slots failed with status ${slotsRes.status}`);
		const slots = JSON.parse(slotsRes.body) as Array<{ id: TSlotId }>;
		slotIds = slots.map(s => s.id);
	}

	if (slotIds.length === 0) throw new Error('No slots to save');

	const dir = await getCheckpointsDir();

	// Enforce disk cap - reject if already at or over limit
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	const capGB = settings.maxCheckpointDiskGB ?? 50;
	if (capGB > 0) {
		const existing = await listCheckpoints({ serverId: null, threadId: null });
		const usedBytes = existing.reduce((s, c) => s + c.sizeBytes, 0);
		const capBytes = capGB * 1024 * 1024 * 1024;
		if (usedBytes >= capBytes) {
			throw new Error(`Checkpoint disk cap reached (${capGB} GB). Delete old checkpoints before saving.`);
		}
	}

	const fingerprint = buildFingerprint(server.modelPath);
	const fingerprintHash = computeFingerprintHash(fingerprint);
	const createdAt = Date.now();
	const bundleId: TBundleId = crypto.randomBytes(8).toString('hex');
	const isAutoSave = req.mode === ECheckpointSaveMode.SAVE && req.name == null;

	const saved: ICheckpoint[] = [];

	for (const slotIndex of slotIds) {
		const id = composeCheckpointId(fingerprintHash, createdAt, slotIndex);
		const filename = `${id}.bin`;

		// Trigger save on llama-server
		const saveRes = await httpPostJson(server.port, `/slots/${slotIndex}?action=save`, { filename });
		if (saveRes.status !== 200) {
			throw new Error(`Save failed for slot ${slotIndex}: status ${saveRes.status}, body: ${saveRes.body}`);
		}

		// Parse response - llama-server may return n_saved/n_written; fall back to fs/logs if absent
		let tokens = 0;
		let sizeBytes = 0;
		try {
			const parsed = JSON.parse(saveRes.body) as { n_saved?: number; n_written?: number };
			if (typeof parsed.n_saved === 'number') tokens = parsed.n_saved;
			if (typeof parsed.n_written === 'number') sizeBytes = parsed.n_written;
		} catch {
			// Ignore parse errors
		}

		// Fallback to fs.stat for size
		if (sizeBytes === 0) {
			const filePath = binPath(dir, id);
			try {
				sizeBytes = fs.statSync(filePath).size;
			} catch {
				sizeBytes = 0;
			}
		}

		const checkpoint: ICheckpoint = {
			id,
			bundleId,
			name: req.name ?? `Checkpoint ${new Date(createdAt).toISOString()}`,
			serverId: req.serverId,
			slotIndex,
			filename,
			fingerprint,
			fingerprintHash,
			sizeBytes,
			tokens,
			messageCount: null,
			lastUserMessagePreview: null,
			isAutoSave,
			notes: req.notes ? truncatePreview(req.notes) : null,
			createdAt,
		};

		writeSidecar(sidecarPath(dir, id), checkpoint);
		saved.push(checkpoint);
	}

	return { bundleId, checkpoints: saved };
}

// Restore checkpoints into a server's slots
export async function restoreCheckpoint(req: IRestoreCheckpointRequest): Promise<IRestoreCheckpointResponse> {
	if (req.checkpointId == null && req.bundleId == null) {
		throw new Error('Either checkpointId or bundleId is required');
	}

	const server = await store.get<IServer>(`${SERVERS_PREFIX}${req.targetServerId}`);
	if (!server) throw new Error(`Target server not found: ${req.targetServerId}`);

	const dir = await getCheckpointsDir();
	const all = await listCheckpoints({ serverId: null, threadId: null });

	let toRestore: ICheckpoint[];
	if (req.bundleId != null) {
		toRestore = all.filter(c => c.bundleId === req.bundleId);
	} else {
		const found = all.find(c => c.id === req.checkpointId);
		toRestore = found ? [found] : [];
	}

	if (toRestore.length === 0) throw new Error('No checkpoints found for given id');

	// Validate target server has enough slots
	const slotsRes = await httpGetJson(server.port, '/slots');
	if (slotsRes.status !== 200) throw new Error(`GET /slots failed with status ${slotsRes.status}`);
	const slots = JSON.parse(slotsRes.body) as Array<{ id: TSlotId }>;
	if (toRestore.length > slots.length) {
		throw new Error(`Bundle requires ${toRestore.length} slots, target server has ${slots.length}`);
	}

	// Validate fingerprint match against target server's model
	const targetFingerprint = buildFingerprint(server.modelPath);
	const targetHash = computeFingerprintHash(targetFingerprint);
	const mismatches: IFingerprintMismatch[] = [];
	const sample = toRestore[0]!;
	if (sample.fingerprintHash !== targetHash) {
		if (sample.fingerprint.modelFilename !== targetFingerprint.modelFilename) {
			mismatches.push({
				field: 'modelFilename',
				expected: sample.fingerprint.modelFilename,
				actual: targetFingerprint.modelFilename,
			});
		}
		if (sample.fingerprint.modelSizeBytes !== targetFingerprint.modelSizeBytes) {
			mismatches.push({
				field: 'modelSizeBytes',
				expected: sample.fingerprint.modelSizeBytes,
				actual: targetFingerprint.modelSizeBytes,
			});
		}
	}

	if (mismatches.length > 0) {
		return { success: false, restoredSlotCount: 0, fingerprintMismatches: mismatches };
	}

	// Restore each into slot 0..N-1 in bundle order (sorted by original slotIndex)
	const ordered = [...toRestore].sort((a, b) => a.slotIndex - b.slotIndex);
	let restored = 0;
	for (let i = 0; i < ordered.length; i++) {
		const cp = ordered[i]!;
		const targetSlot = i;
		const restoreRes = await httpPostJson(server.port, `/slots/${targetSlot}?action=restore`, { filename: cp.filename });
		console.log(`[CheckpointService] Restore slot ${targetSlot} response - status: ${restoreRes.status}, body: ${restoreRes.body}`);
		if (restoreRes.status !== 200) {
			throw new Error(`Restore failed for slot ${targetSlot} (checkpoint ${cp.id}): status ${restoreRes.status}, body: ${restoreRes.body}`);
		}
		restored++;
	}

	return { success: true, restoredSlotCount: restored, fingerprintMismatches: [] };
}

// List all checkpoints, optionally filtered
export async function listCheckpoints(query: IListCheckpointsQuery): Promise<ICheckpoint[]> {
	const dir = await getCheckpointsDir();
	const entries = fs.readdirSync(dir);
	const checkpoints: ICheckpoint[] = [];
	for (const entry of entries) {
		if (!entry.endsWith('.json')) continue;
		const data = readSidecar(path.join(dir, entry));
		if (data == null) continue;
		if (query.serverId != null && data.serverId !== query.serverId) continue;
		checkpoints.push(data);
	}
	// Threaded filtering via bindings is handled by routes layer, not here
	return checkpoints.sort((a, b) => b.createdAt - a.createdAt);
}

// Delete a checkpoint by id (removes both .bin and .json)
export async function deleteCheckpoint(id: TCheckpointId): Promise<boolean> {
	const dir = await getCheckpointsDir();
	const sidecar = sidecarPath(dir, id);
	const bin = binPath(dir, id);
	let removed = false;
	if (fs.existsSync(sidecar)) { fs.unlinkSync(sidecar); removed = true; }
	if (fs.existsSync(bin)) { fs.unlinkSync(bin); removed = true; }
	return removed;
}

// Update a checkpoint's editable fields (name, notes)
export async function updateCheckpoint(id: TCheckpointId, patch: { name?: string; notes?: string | null }): Promise<ICheckpoint | null> {
	const dir = await getCheckpointsDir();
	const filePath = sidecarPath(dir, id);
	const existing = readSidecar(filePath);
	if (existing == null) return null;
	if (patch.name !== undefined) existing.name = patch.name;
	if (patch.notes !== undefined) existing.notes = patch.notes ? truncatePreview(patch.notes) : null;
	writeSidecar(filePath, existing);
	return existing;
}

// Restore multiple checkpoints with explicit slot mapping
export async function restoreCheckpointsMapped(req: IRestoreCheckpointsMappedRequest): Promise<IRestoreCheckpointResponse> {
	if (req.mappings.length === 0) throw new Error('No mappings provided');

	// Validate no duplicate target slots
	const targetSet = new Set<TSlotId>();
	for (const m of req.mappings) {
		if (targetSet.has(m.targetSlotId)) throw new Error(`Duplicate target slot: ${m.targetSlotId}`);
		targetSet.add(m.targetSlotId);
	}

	const server = await store.get<IServer>(`${SERVERS_PREFIX}${req.targetServerId}`);
	if (!server) throw new Error(`Target server not found: ${req.targetServerId}`);

	const all = await listCheckpoints({ serverId: null, threadId: null });
	const mapByCheckpointId: Record<TCheckpointId, ICheckpoint> = {};
	for (const cp of all) mapByCheckpointId[cp.id] = cp;

	// Validate all mapped checkpoints exist
	for (const m of req.mappings) {
		if (mapByCheckpointId[m.checkpointId] == null) {
			throw new Error(`Checkpoint not found: ${m.checkpointId}`);
		}
	}

	// Validate target server has those slots
	const slotsRes = await httpGetJson(server.port, '/slots');
	if (slotsRes.status !== 200) throw new Error(`GET /slots failed with status ${slotsRes.status}`);
	const serverSlots = JSON.parse(slotsRes.body) as Array<{ id: TSlotId }>;
	const serverSlotSet = new Set(serverSlots.map(s => s.id));
	for (const m of req.mappings) {
		if (!serverSlotSet.has(m.targetSlotId)) {
			throw new Error(`Target server has no slot ${m.targetSlotId}`);
		}
	}

	// Validate fingerprint against target server's model
	const targetFingerprint = buildFingerprint(server.modelPath);
	const targetHash = computeFingerprintHash(targetFingerprint);
	const mismatches: IFingerprintMismatch[] = [];
	const sample = mapByCheckpointId[req.mappings[0]!.checkpointId]!;
	if (sample.fingerprintHash !== targetHash) {
		if (sample.fingerprint.modelFilename !== targetFingerprint.modelFilename) {
			mismatches.push({
				field: 'modelFilename',
				expected: sample.fingerprint.modelFilename,
				actual: targetFingerprint.modelFilename,
			});
		}
		if (sample.fingerprint.modelSizeBytes !== targetFingerprint.modelSizeBytes) {
			mismatches.push({
				field: 'modelSizeBytes',
				expected: sample.fingerprint.modelSizeBytes,
				actual: targetFingerprint.modelSizeBytes,
			});
		}
	}
	if (mismatches.length > 0) {
		return { success: false, restoredSlotCount: 0, fingerprintMismatches: mismatches };
	}

	// Execute restores
	let restored = 0;
	for (const m of req.mappings) {
		const cp = mapByCheckpointId[m.checkpointId]!;
		const res = await httpPostJson(server.port, `/slots/${m.targetSlotId}?action=restore`, { filename: cp.filename });
		console.log(`[CheckpointService] Restore slot ${m.targetSlotId} response - status: ${res.status}, body: ${res.body}`);
		if (res.status !== 200) {
			throw new Error(`Restore failed for target slot ${m.targetSlotId} (checkpoint ${cp.id}): status ${res.status}, body: ${res.body}`);
		}
		restored++;
	}

	return { success: true, restoredSlotCount: restored, fingerprintMismatches: [] };
}
