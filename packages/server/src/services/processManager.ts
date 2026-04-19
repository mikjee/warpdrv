import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import net from 'net';
import type { IServer, ILaunchParams, IChatInferenceParams } from '@warpcore/shared';
import { EServerStatus, EKvQuantType } from '@warpcore/shared';
import { INFER_PARAM_TO_API } from '@warpcore/bridge/inferParamNames';
import { startStatsPolling, stopStatsPolling } from './statsPoller';
import { bootstrapServer, teardownServer, parseLogLine } from './slotStateTracker';
import { listCheckpoints, restoreCheckpoint, saveCheckpoint, getCheckpointsDir } from './checkpointService';
import { ECheckpointSaveMode } from '@warpcore/shared';
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
async function emitServerUpdate(serverId: string, status: EServerStatus, error: string | null, startedAt: number | null | undefined, launchCommand?: string): Promise<void> {
	try {
		const server = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
		if (server) {
			const updated: IServer = {
				...server,
				status,
				error,
				...(startedAt != null && { startedAt }),
				...(launchCommand !== undefined && { launchCommand }),
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
	extraArgs?: Record<string, string>,
	inferenceParams?: Partial<IChatInferenceParams>,
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
	// Inference params defaults
	if (inferenceParams) {
		for (const [camelKey, value] of Object.entries(inferenceParams)) {
			if (value === undefined || value === null) continue;
			const apiName = INFER_PARAM_TO_API[camelKey] ?? camelKey;
			const cliFlag = apiName.replace(/_/g, '-');
			if (Array.isArray(value)) {
				for (const v of value) args.push(`--${cliFlag}`, String(v));
			} else if (typeof value === 'object') {
				args.push(`--${cliFlag}`, JSON.stringify(value));
			} else {
				args.push(`--${cliFlag}`, String(value));
			}
		}
	}
	args.push('--host', '0.0.0.0');
	args.push('--port', String(params.port));
	// Injected extra args (e.g., --slot-save-path)
	if (extraArgs) {
		for (const [key, value] of Object.entries(extraArgs)) {
			args.push(`--${key}`, value);
		}
	}
	// Extra args — split by whitespace
	if (params.extraArgs.trim()) {
		args.push(...params.extraArgs.trim().split(/\s+/));
	}
	return args;
}
// Async wrapper that injects checkpoint path
export async function buildServerArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
	inferenceParams?: Partial<IChatInferenceParams>,
): Promise<string[]> {
	const checkpointDir = await getCheckpointsDir();
	return buildArgs(modelPath, mmprojPath, params, defaultArgs, { 'slot-save-path': checkpointDir }, inferenceParams);
}
// Spawn a llama-server process
export function spawnServer(
	serverId: string,
	binaryPath: string,
	args: string[],
	onStatusChange: (status: EServerStatus, error?: string) => void,
): number | null {
	try {
		const launchCommand = [binaryPath, ...args].join(' ');
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
				parseLogLine(serverId, line);
			}
		});
		child.stderr?.on('data', (data: Buffer) => {
			const lines = data.toString().split('\n').filter(Boolean);
			for (const line of lines) {
				appendLog(line);
				sseManager.emit('servers:logs', { [serverId]: [line] });
				parseLogLine(serverId, line);
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
					// startStatsPolling(serverId, port);
					await bootstrapServer(serverId, port);
					await maybeAutoLoadCheckpoint(serverId);
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
			// stopStatsPolling(serverId);
			teardownServer(serverId);
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
		emitServerUpdate(serverId, EServerStatus.LOADING, null, null, launchCommand).catch(() => {});
		return child.pid ?? null;
	} catch (err) {
		onStatusChange(EServerStatus.ERROR, String(err));
		emitServerUpdate(serverId, EServerStatus.ERROR, String(err), null).catch(() => {});
		return null;
	}
}
// Kill a running server process and wait for termination
export async function killServer(serverId: string, pid?: number): Promise<boolean> {
    // Auto-save checkpoint before kill if enabled
    await maybeAutoSaveCheckpoint(serverId);

    const child = processes.get(serverId);
    
// Helper to check if port is free
	const isPortFree = (port: number): Promise<boolean> => {
		return new Promise((resolvePort) => {
			const server = net.createServer();
			server.listen(port, '127.0.0.1', () => {
                server.close();
                resolvePort(true);
            });
            server.on('error', () => resolvePort(false));
        });
    };
    
    // Try to kill from in-memory process first, then fall back to PID
    if (child?.pid) {
        // stopStatsPolling(serverId);
        teardownServer(serverId);
        
        return new Promise((resolve) => {
            const pidToUse = child.pid;
            let resolved = false;
            
            const cleanup = () => {
                if (!resolved) {
                    resolved = true;
                    processes.delete(serverId);
                }
            };
            
            const finish = (success: boolean) => {
                cleanup();
                resolve(success);
            };
            
            // Listen for process exit
            child.once('exit', (code) => {
                const status = code !== 0 && code !== null 
                    ? EServerStatus.ERROR 
                    : EServerStatus.STOPPED;
                const error = code !== 0 && code !== null 
                    ? `Process exited with code ${code}` 
                    : null;
                
                emitServerUpdate(serverId, status, error, null).catch(() => {});
                
                // Look up port from server config and wait for it to be free
                const waitForPort = async () => {
                    try {
                        const server = await store.get<IServer>(`${SERVERS_PREFIX}${serverId}`);
                        const port = server?.port || 0;
                        
                        if (port > 0) {
                            let portAttempts = 0;
                            const checkPort = async () => {
                                const free = await isPortFree(port);
                                if (free) {
                                    finish(true);
                                } else if (portAttempts < 20) {
                                    portAttempts++;
                                    setTimeout(checkPort, 250);
                                } else {
                                    finish(true);
                                }
                            };
                            checkPort();
                        } else {
                            finish(true);
                        }
                    } catch {
                        finish(true);
                    }
                };
                
                waitForPort();
            });
            
            // Send SIGTERM to process group
            try {
                process.kill(-pidToUse!, 'SIGTERM');
            } catch (err) {
                if (isProcessAlive(pidToUse!)) {
                    finish(false);
                } else {
                    finish(true);
                }
                return;
            }
            
            // If not exited after 5 seconds, force kill with SIGKILL
            const timeout = setTimeout(() => {
                if (isProcessAlive(pidToUse!)) {
                    try {
                        process.kill(-pidToUse!, 'SIGKILL');
                    } catch {}
                    setTimeout(() => {
                        if (!resolved) {
                            finish(true);
                        }
                    }, 200);
                }
            }, 5000);
        });
    }
    
    // If not in map, try to kill using PID from storage (orphan process)
    if (pid) {
        // stopStatsPolling(serverId);
        teardownServer(serverId);
        if (!isProcessAlive(pid)) {
            return true;
        }
        
        return new Promise((resolve) => {
            let resolved = false;
            
            const finish = (success: boolean) => {
                if (!resolved) {
                    resolved = true;
                    resolve(success);
                }
            };
            
            // Send SIGTERM
            try {
                process.kill(-pid, 'SIGTERM');
            } catch {
                finish(false);
                return;
            }
            
            // Poll until process is dead
            const checkInterval = setInterval(async () => {
                if (!isProcessAlive(pid)) {
                    clearInterval(checkInterval);
                    finish(true);
                }
            }, 100);
            
            // Force kill after 5 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                if (isProcessAlive(pid)) {
                    try {
                        process.kill(-pid, 'SIGKILL');
                    } catch {}
                    setTimeout(() => finish(true), 200);
                }
            }, 5000);
        });
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

// Auto-load latest compatible checkpoint if enabled on this server
async function maybeAutoLoadCheckpoint(serverId: string): Promise<void> {
	try {
		const { store } = await import('../util/store');
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server || !server.autoLoadCheckpointOnStart) return;
		const all = await listCheckpoints({ serverId: null, threadId: null });
		const forThisServer = all.filter(c => c.serverId === serverId);
		if (forThisServer.length === 0) return;
		const latest = forThisServer.sort((a, b) => b.createdAt - a.createdAt)[0]!;
		const targetBundleId = latest.bundleId;
		await restoreCheckpoint({
			checkpointId: targetBundleId ? null : latest.id,
			bundleId: targetBundleId,
			targetServerId: serverId,
		});
	} catch (err) {
		console.error(`[auto-load] ${serverId}:`, err);
	}
}

// Auto-save all slots as a bundle if enabled on this server
async function maybeAutoSaveCheckpoint(serverId: string): Promise<void> {
	try {
		const { store } = await import('../util/store');
		const server = await store.get<IServer>(`servers:${serverId}`);
		if (!server || !server.autoSaveCheckpointOnStop) return;
		await saveCheckpoint({
			serverId,
			slotIds: null,
			mode: ECheckpointSaveMode.SAVE,
			name: `Auto-save ${new Date().toISOString()}`,
			notes: null,
		});
	} catch (err) {
		console.error(`[auto-save] ${serverId}:`, err);
	}
}