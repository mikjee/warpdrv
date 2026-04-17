import { existsSync } from 'fs';
import { execSync } from 'child_process';

let cachedShellPath: string | null = null;

export class BashNotFoundError extends Error {
	constructor() {
		super('bash not found. Install bash (Linux/Mac) or Git Bash/WSL (Windows).');
		this.name = 'BashNotFoundError';
	}
}

export function resolveBashPath(): string {
	if (cachedShellPath !== null) return cachedShellPath;

	const candidates = process.platform === 'win32'
		? [
			'C:\\Program Files\\Git\\bin\\bash.exe',
			'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
		]
		: [
			'/bin/bash',
			'/usr/bin/bash',
			'/usr/local/bin/bash',
			'/opt/homebrew/bin/bash',
		];

	for (const p of candidates) {
		if (existsSync(p)) { cachedShellPath = p; return p; }
	}

	try {
		const cmd = process.platform === 'win32' ? 'where bash' : 'which bash';
		const found = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0];
		if (found && existsSync(found)) { cachedShellPath = found; return found; }
	}
	catch {}

	throw new BashNotFoundError();
}
