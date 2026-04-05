// ============================================================
// warpbridge/src/mcp/config.ts
// MCP config file reader/writer.
// Node only — filesystem access.
// ============================================================

import fs from 'fs';
import path from 'path';
import type { IMcpConfig } from '../types/interfaces';
import type { IMcpConfigFile, IMcpServerEntry } from '../types';

const DEFAULT_CONFIG: IMcpConfigFile = { mcpServers: {} };

export class McpConfig implements IMcpConfig {
	private configPath: string;

	constructor(configPath: string) {
		this.configPath = configPath;
	}

	read(): IMcpConfigFile {
		try {
			if (fs.existsSync(this.configPath)) {
				const raw = fs.readFileSync(this.configPath, 'utf8');
				const parsed = JSON.parse(raw);
				if (!parsed.mcpServers || typeof parsed.mcpServers !== 'object') {
					return { ...DEFAULT_CONFIG };
				}
				return parsed as IMcpConfigFile;
			}
		} catch { /* ignore */ }
		return { ...DEFAULT_CONFIG };
	}

	write(config: IMcpConfigFile): void {
		const dir = path.dirname(this.configPath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(this.configPath, JSON.stringify(config, null, '\t'), 'utf8');
	}

	getPath(): string {
		return this.configPath;
	}

	addServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
		const config = this.read();
		config.mcpServers[name] = entry;
		this.write(config);
		return config;
	}

	removeServer(name: string): IMcpConfigFile {
		const config = this.read();
		delete config.mcpServers[name];
		this.write(config);
		return config;
	}

	updateServer(name: string, entry: IMcpServerEntry): IMcpConfigFile {
		const config = this.read();
		config.mcpServers[name] = entry;
		this.write(config);
		return config;
	}
}
