import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import type { IServer, ILaunchParams } from '@warpcore/shared';
import { EServerStatus, EKvQuantType } from '@warpcore/shared';
import { startStatsPolling, stopStatsPolling } from './statsPoller';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';

const SERVERS_PREFIX = 'servers:';
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

// Emit full server update via SSE
async function emitServerUpdate(serverId: string, status: EServerStatus, error: string | null, startedAt?: number | null): Promise<void> {
	try {
		const server = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
		if (server) {
			const updated: IServer = {
				...server,
				status,
				error,
				...(startedAt != null && { startedAt }),
			};
			sseManager.emit('servers:update', { [serverId]: updated });
		}
	} catch {
		// Ignore errors - SSE is optional
	}
}
// Build the llama-server command line args from params
export function buildArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
): string[] {
	const args: string[] = [...defaultArgs];
	const argsSet = new Set(defaultArgs);
	// Remove -fa and its value from defaultArgs if present (will add properly formatted version below)
	if (argsSet.has('-fa')) {
		const idx = args.indexOf('-fa');
		if (idx !== -1) {
			args.splice(idx, 2); // remove -fa and its following value
			argsSet.delete('-fa');
		}
	}
	args.push('-m', modelPath);
	if (mmprojPath) args.push('--mmproj', mmprojPath);
	if (params.gpuLayers > 0 && !argsSet.has('-ngl')) args.push('-ngl', String(params.gpuLayers));
	if (params.contextSize > 0 && !argsSet.has('-c')) args.push('-c', String(params.contextSize));
	if (params.batchSize > 0 && !argsSet.has('-b')) args.push('-b', String(params.batchSize));
	if (params.ubatchSize > 0 && !argsSet.has('-ub')) args.push('-ub', String(params.ubatchSize));
	if (params.threads > 0 && !argsSet.has('-t')) args.push('-t', String(params.threads));
	if (params.threadsBatch > 0 && !argsSet.has('-tb')) args.push('-tb', String(params.threadsBatch));
	if (params.flashAttn && !argsSet.has('-fa')) args.push('-fa', 'on');
	if (params.mlock && !argsSet.has('--mlock')) args.push('--mlock');
	if (!params.mmap && !argsSet.has('--no-mmap') && !argsSet.has('--mmap')) args.push('--no-mmap');
	if (params.directIo && !argsSet.has('-dio')) args.push('-dio');
	if (params.noWarmup && !argsSet.has('--no-warmup')) args.push('--no-warmup');
	if (params.jinja && !argsSet.has('--jinja')) args.push('--jinja');
	if (params.kvQuantK !== EKvQuantType.F16) args.push('--cache-type-k', params.kvQuantK);
	if (params.kvQuantV !== EKvQuantType.F16) args.push('--cache-type-v', params.kvQuantV);
	if (params.chatTemplate) args.push('--chat-template', params.chatTemplate);
	if (params.device) args.push('--device', params.device);
	// Parallel slots - add --kv-unified to share context across all slots instead of splitting it
	if (params.parallelSlots > 0) {
		args.push('-np', String(params.parallelSlots));
		args.push('--kv-unified');
	}
	// Speculative decoding
	if (params.specDecode?.enabled && params.specDecode.draftModelPath) {
		args.push('--model-draft', params.specDecode.draftModelPath);
		if (params.specDecode.draftDevice) args.push('--device-draft', params.specDecode.draftDevice);
		if (params.specDecode.draftGpuLayers > 0) args.push('--gpu-layers-draft', String(params.specDecode.draftGpuLayers));
		if (params.specDecode.draftContextSize > 0) args.push('--ctx-size-draft', String(params.specDecode.draftContextSize));
		if (params.specDecode.draftMax > 0) args.push('--draft-max', String(params.specDecode.draftMax));
		if (params.specDecode.draftMin > 0) args.push('--draft-min', String(params.specDecode.draftMin));
		if (params.specDecode.draftPMin > 0) args.push('--draft-p-min', String(params.specDecode.draftPMin));
	}
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
			for (const line of lines) {
				appendLog(line);
				sseManager.emit('servers:logs', { [serverId]: [line] });
			}
		});
		child.stderr?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				appendLog(line);
				sseManager.emit('servers:logs', { [serverId]: [line] });
			}
		});
		// Extract port from args for health polling
		const portIdx = args.indexOf('--port');
		const port = portIdx !== -1 ? parseInt(args[portIdx + 1] ?? '0', 10) : 0;
		// Start health poller instead of relying on stdout parsing
		let healthInterval: ReturnType<typeof setInterval> | null = null;
		if (port > 0) {
			healthInterval = pollHealth(
				port,
				async () => {
					onStatusChange(EServerStatus.RUNNING);
					await emitServerUpdate(serverId, EServerStatus.RUNNING, null, Date.now());
					startStatsPolling(serverId, port);
				},
				async (err) => {
					onStatusChange(EServerStatus.ERROR, err);
					await emitServerUpdate(serverId, EServerStatus.ERROR, err, null);
				},
			);
		}
		child.on('error', async (err) => {
			if (healthInterval) clearInterval(healthInterval);
			onStatusChange(EServerStatus.ERROR, err.message);
			await emitServerUpdate(serverId, EServerStatus.ERROR, err.message, null);
		});
		child.on('exit', (code) => {
			if (healthInterval) clearInterval(healthInterval);
			stopStatsPolling(serverId);
			processes.delete(serverId);
			if (code !== 0 && code !== null) {
				onStatusChange(EServerStatus.ERROR, `Process exited with code ${code}`);
				emitServerUpdate(serverId, EServerStatus.ERROR, `Process exited with code ${code}`, null).catch(() => {});
			} else {
				onStatusChange(EServerStatus.STOPPED);
				emitServerUpdate(serverId, EServerStatus.STOPPED, null, null).catch(() => {});
			}
		});
		onStatusChange(EServerStatus.LOADING);
		emitServerUpdate(serverId, EServerStatus.LOADING, null, null).catch(() => {});
		return child.pid ?? null;
	} catch (err) {
		onStatusChange(EServerStatus.ERROR, String(err));
		emitServerUpdate(serverId, EServerStatus.ERROR, String(err), null).catch(() => {});
		return null;
	}
}
// Kill a running server process and wait for termination
export async function killServer(serverId: string, pid?: number): Promise<boolean> {
	const child = processes.get(serverId);
	// Try to kill from in-memory process first, then fall back to PID
	if (child?.pid) {
		stopStatsPolling(serverId);
		return new Promise((resolve) => {
			const timeout = setTimeout(() => {
				processes.delete(serverId);
				resolve(false);
			}, 10000);
			child.once('exit', async (code) => {
				clearTimeout(timeout);
				processes.delete(serverId);
				if (code !== 0 && code !== null) {
					await emitServerUpdate(serverId, EServerStatus.ERROR, `Process exited with code ${code}`, null);
				} else {
					await emitServerUpdate(serverId, EServerStatus.STOPPED, null, null);
				}
				resolve(true);
			});
				try {
					if (child.pid) process.kill(-child.pid, 'SIGTERM');
				} catch {
				clearTimeout(timeout);
				processes.delete(serverId);
				resolve(false);
			}
		});
	}
	// If not in map, try to kill using PID from storage (orphan process)
	if (pid) {
		stopStatsPolling(serverId);
		try {
			process.kill(-pid, 'SIGTERM');
			return true;
		} catch {
			return false;
		}
	}
	return false;
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