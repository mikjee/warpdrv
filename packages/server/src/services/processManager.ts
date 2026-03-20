import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import type { IServer, ILaunchParams } from '@warpcore/shared';
import { EServerStatus, EKvQuantType } from '@warpcore/shared';

// Health poller — checks /health endpoint until server is ready or timeout
function pollHealth(
	port: number,
	onReady: () => void,
	onFail: (err: string) => void,
): ReturnType<typeof setInterval> {
	let attempts = 0;
	const maxAttempts = 120; // 2 minutes at 1s intervals

	const interval = setInterval(() => {
		attempts++;
		if (attempts > maxAttempts) {
			clearInterval(interval);
			onFail('Server did not become ready within 2 minutes');
			return;
		}

		const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 2000 }, (res) => {
			if (res.statusCode === 200) {
				clearInterval(interval);
				onReady();
			}
		});
		req.on('error', () => {}); // not ready yet, keep polling
		req.on('timeout', () => req.destroy());
	}, 1000);

	return interval;
}

// In-memory map of running processes (keyed by server ID)
const processes = new Map<string, ChildProcess>();
// In-memory log buffers (last N lines per server)
const logBuffers = new Map<string, string[]>();
const MAX_LOG_LINES = 500;

// Build the llama-server command line args from params
export function buildArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
): string[] {
	const args: string[] = [...defaultArgs];

	args.push('-m', modelPath);

	if (mmprojPath) args.push('--mmproj', mmprojPath);

	if (params.gpuLayers > 0) args.push('-ngl', String(params.gpuLayers));
	if (params.contextSize > 0) args.push('-c', String(params.contextSize));
	if (params.batchSize > 0) args.push('-b', String(params.batchSize));
	if (params.ubatchSize > 0) args.push('-ub', String(params.ubatchSize));
	if (params.threads > 0) args.push('-t', String(params.threads));
	if (params.threadsBatch > 0) args.push('-tb', String(params.threadsBatch));

	if (params.flashAttn && !defaultArgs.includes('-fa')) args.push('-fa', '1');
	if (params.mlock && !defaultArgs.includes('--mlock')) args.push('--mlock');
	if (!params.mmap) args.push('--no-mmap');
	if (params.directIo && !defaultArgs.includes('-dio')) args.push('-dio');
	if (params.noWarmup && !defaultArgs.includes('--no-warmup')) args.push('--no-warmup');
	if (params.jinja) args.push('--jinja');

	if (params.kvQuantK !== EKvQuantType.F16) args.push('--cache-type-k', params.kvQuantK);
	if (params.kvQuantV !== EKvQuantType.F16) args.push('--cache-type-v', params.kvQuantV);

	if (params.chatTemplate) args.push('--chat-template', params.chatTemplate);
	if (params.device) args.push('--device', params.device);

	args.push('--host', '0.0.0.0');
	args.push('--port', String(params.port));

	// Extra args — split by whitespace
	if (params.extraArgs.trim()) {
		args.push(...params.extraArgs.trim().split(/\s+/));
	}

	return args;
}

// Spawn a llama-server process
export function spawnServer(
	serverId: string,
	binaryPath: string,
	args: string[],
	onStatusChange: (status: EServerStatus, error?: string) => void,
): number | null {
	try {
		const child = spawn(binaryPath, args, {
			detached: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		// Don't let this child keep the parent alive
		child.unref();

		processes.set(serverId, child);
		logBuffers.set(serverId, []);

		const appendLog = (line: string) => {
			const buf = logBuffers.get(serverId);
			if (buf) {
				buf.push(line);
				if (buf.length > MAX_LOG_LINES) buf.shift();
			}
		};

		child.stdout?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) appendLog(line);
		});

		child.stderr?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) appendLog(line);
		});

		// Extract port from args for health polling
		const portIdx = args.indexOf('--port');
		const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '0', 10) : 0;

		// Start health poller instead of relying on stdout parsing
		let healthInterval: ReturnType<typeof setInterval> | null = null;
		if (port > 0) {
			healthInterval = pollHealth(
				port,
				() => onStatusChange(EServerStatus.RUNNING),
				(err) => onStatusChange(EServerStatus.ERROR, err),
			);
		}

		child.on('error', (err) => {
			if (healthInterval) clearInterval(healthInterval);
			onStatusChange(EServerStatus.ERROR, err.message);
		});

		child.on('exit', (code) => {
			if (healthInterval) clearInterval(healthInterval);
			processes.delete(serverId);
			if (code !== 0 && code !== null) {
				onStatusChange(EServerStatus.ERROR, `Process exited with code ${code}`);
			} else {
				onStatusChange(EServerStatus.STOPPED);
			}
		});

		onStatusChange(EServerStatus.LOADING);
		return child.pid ?? null;
	} catch (err) {
		onStatusChange(EServerStatus.ERROR, String(err));
		return null;
	}
}

// Kill a running server process
export function killServer(serverId: string): boolean {
	const child = processes.get(serverId);
	if (!child) return false;

	try {
		// Kill the process group (negative PID kills the group)
		if (child.pid) process.kill(-child.pid, 'SIGTERM');
		processes.delete(serverId);
		return true;
	} catch {
		return false;
	}
}

// Check if a process is still alive by PID
export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

// Get log buffer for a server
export function getServerLogs(serverId: string): string[] {
	return logBuffers.get(serverId) ?? [];
}

// Clear log buffer
export function clearServerLogs(serverId: string): void {
	logBuffers.set(serverId, []);
}

// Get all tracked process IDs
export function getTrackedServerIds(): string[] {
	return [...processes.keys()];
}
