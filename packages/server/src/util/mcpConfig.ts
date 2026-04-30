// ============================================================
// FILE: packages/server/src/util/mcpConfig.ts
// Reads and writes ~/.config/warpcore/mcp.json
// ============================================================

import fs from 'fs';
import path from 'path';
import os from 'os';
import type { IMcpConfigFile, IMcpServerEntry } from '@warpcore/shared';

export function getDataDir(): string {
	const platform = os.platform();
	if (platform === 'win32') return path.join(os.homedir(), 'AppData', 'Roaming', 'warpcore');
	if (platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'warpcore');
	return path.join(os.homedir(), '.config', 'warpcore');
}

const MCP_CONFIG_PATH = path.join(getDataDir(), 'mcp.json');

const DEFAULT_CONFIG: IMcpConfigFile = {
	mcpServers: {},
};

export function readMcpConfig(): IMcpConfigFile {
	try {
		if (fs.existsSync(MCP_CONFIG_PATH)) {
			const raw = fs.readFileSync(MCP_CONFIG_PATH, 'utf8');
			const parsed = JSON.parse(raw);
			// Ensure shape is correct
			if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
				return { ...DEFAULT_CONFIG, ...parsed, mcpServers: parsed.mcpServers ?? {} };
			}
			return parsed as IMcpConfigFile;
		}
	} catch (err) {
		console.error('[MCP Config] Failed to read mcp.json:', err);
	}
	return { ...DEFAULT_CONFIG };
}

export function writeMcpConfig(config: IMcpConfigFile): void {
	const dir = getDataDir();
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, '\t'), 'utf8');
}

export function getMcpConfigPath(): string {
	return MCP_CONFIG_PATH;
}

export function addMcpServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
	const config = readMcpConfig();
	config.mcpServers[name] = entry;
	writeMcpConfig(config);
	return config;
}

export function removeMcpServer(name: string): IMcpConfigFile {
	const config = readMcpConfig();
	delete config.mcpServers[name];
	writeMcpConfig(config);
	return config;
}

export function updateMcpServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
	const config = readMcpConfig();
	config.mcpServers[name] = entry;
	writeMcpConfig(config);
	return config;
}
