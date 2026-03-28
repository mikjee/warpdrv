import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import type { IChatPreset, IChatPresetCreatePayload } from '@warpcore/shared';

function getPresetsDir(): string {
	const platform = os.platform();
	let base: string;
	if (platform === 'win32') base = path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	else if (platform === 'darwin') base = path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	else base = path.join(os.homedir(), '.config', 'warpcore');
	return path.join(base, 'chat-presets');
}

function ensureDir(): string {
	const dir = getPresetsDir();
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	return dir;
}

export function listChatPresets(): IChatPreset[] {
	const dir = ensureDir();
	const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
	const presets: IChatPreset[] = [];
	for (const file of files) {
		try {
			const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
			presets.push(JSON.parse(raw) as IChatPreset);
		} catch {
			// skip malformed files
		}
	}
	return presets.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getChatPreset(id: string): IChatPreset | null {
	const filePath = path.join(ensureDir(), `${id}.json`);
	if (!fs.existsSync(filePath)) return null;
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as IChatPreset;
	} catch {
		return null;
	}
}

export function createChatPreset(payload: IChatPresetCreatePayload): IChatPreset {
	const dir = ensureDir();
	const now = Date.now();
	const preset: IChatPreset = {
		id: crypto.randomUUID(),
		name: payload.name,
		systemPrompt: payload.systemPrompt,
		params: payload.params,
		createdAt: now,
		updatedAt: now,
	};
	fs.writeFileSync(path.join(dir, `${preset.id}.json`), JSON.stringify(preset, null, '\t'));
	return preset;
}

export function updateChatPreset(id: string, payload: Partial<IChatPresetCreatePayload>): IChatPreset | null {
	const existing = getChatPreset(id);
	if (!existing) return null;
	const updated: IChatPreset = {
		...existing,
		...payload,
		params: payload.params ? payload.params : existing.params,
		updatedAt: Date.now(),
	};
	fs.writeFileSync(path.join(ensureDir(), `${id}.json`), JSON.stringify(updated, null, '\t'));
	return updated;
}

export function deleteChatPreset(id: string): boolean {
	const filePath = path.join(ensureDir(), `${id}.json`);
	if (!fs.existsSync(filePath)) return false;
	fs.unlinkSync(filePath);
	return true;
}