import { spawn, spawnSync, type ChildProcess } from 'child_process';
import http from 'http';
import net from 'net';
import type { IServer, ILaunchParams, IChatInferenceParams, IBackend, IBackendGroup, ISettings } from '@warpcore/shared';
import { EServerStatus, EKvQuantType, DEFAULT_SETTINGS } from '@warpcore/shared';
import { parse as shellParse } from 'shell-quote';
import { bootstrapServer, teardownServer, parseLogLine } from './slotStateTracker';
import { listCheckpoints, restoreCheckpoint, saveCheckpoint, getCheckpointsDir } from './checkpointService';
import { ECheckpointSaveMode } from '@warpcore/shared';
import { store } from '../util/store';
import { sseManager } from './sseManagerInstance';
import { getCachedModels } from '../routes/models';

export const SERVERS_PREFIX = 'servers:';
const SETTINGS_KEY = 'settings:general';

// Cross-platform process tree kill.
// Linux/macOS: signal the process group via negative PID.
// Windows: taskkill /T /F walks the process tree and force-terminates.
function killProcessTree(pid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
	if (process.platform === 'win32') {
		const args = signal === 'SIGKILL'
			? ['/T', '/F', '/PID', String(pid)]
			: ['/T', '/PID', String(pid)];
		spawnSync('taskkill', args, { stdio: 'ignore' });
	} else {
		process.kill(-pid, signal);
	}
}

// Track used ports to avoid collisions
export const usedPorts = new Set<number>();

// Health poller — checks /health endpoint until server is ready or timeout
export function pollHealth(
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
	// Remove -ngl and its value from defaultArgs if present (slider controls gpuLayers)
	if (argsSet.has('-ngl')) {
		const idx = args.indexOf('-ngl');
		if (idx !== -1) {
			args.splice(idx, 2); // remove -ngl and its following value
			argsSet.delete('-ngl');
		}
	}
	args.push('-m', modelPath);
	if (mmprojPath) args.push('--mmproj', mmprojPath);
	if (params.gpuLayersAuto !== true && params.gpuLayers > 0 && !argsSet.has('-ngl')) args.push('-ngl', String(params.gpuLayers));
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
	if (params.swaFull && !argsSet.has('--swa-full')) args.push('--swa-full');
	if (params.kvQuantK !== EKvQuantType.F16) args.push('--cache-type-k', params.kvQuantK);
	if (params.kvQuantV !== EKvQuantType.F16) args.push('--cache-type-v', params.kvQuantV);
	if (params.chatTemplate) args.push('--chat-template', params.chatTemplate);
	if (params.device && !params.multiGpu) args.push('--device', params.device);
	// Multi-GPU tensor split — preserve zeros to maintain device index alignment
	if (params.multiGpu && params.gpuSplitValues && params.gpuSplitValues.length > 1) {
		args.push('-ts', params.gpuSplitValues.join(','));
	}
	// Split mode (layer is default, only emit when different)
	if (params.multiGpu && params.splitMode && params.splitMode !== 'layer') {
		args.push('-sm', params.splitMode);
	}
	// Main GPU (-1 or undefined = default/GPU0)
	if (params.multiGpu && params.mainGpu !== undefined && params.mainGpu >= 0) {
		args.push('-mg', String(params.mainGpu));
	}
	// Parallel slots - add --kv-unified to share context across all slots instead of splitting it
	if (params.parallelSlots > 0) {
		args.push('-np', String(params.parallelSlots));
		args.push('--kv-unified');
	}
	// Speculative decoding
	if (params.specDecode?.enabled) {
		const sd = params.specDecode;
		const isNgram = sd.mode === 'ngram';
		// Ngram mode — draftless speculative decoding
		if (isNgram && sd.specType && sd.specType !== 'none') {
			args.push('--spec-type', sd.specType);
			if (sd.ngramSizeN) args.push('--spec-ngram-size-n', String(sd.ngramSizeN));
			if (sd.ngramSizeM) args.push('--spec-ngram-size-m', String(sd.ngramSizeM));
			if ((sd.specType === 'ngram-map-k' || sd.specType === 'ngram-map-k4v') && sd.ngramMinHits) {
				args.push('--spec-ngram-min-hits', String(sd.ngramMinHits));
			}
		}
		// Draft model mode
		if (!isNgram && sd.draftModelPath) {
			args.push('--model-draft', sd.draftModelPath);
			if (sd.draftDevice) args.push('--device-draft', sd.draftDevice);
			if (sd.draftGpuLayers > 0) args.push('--gpu-layers-draft', String(sd.draftGpuLayers));
			if (sd.draftContextSize > 0) args.push('--ctx-size-draft', String(sd.draftContextSize));
		}
		// Shared across modes
		if (sd.draftMax > 0) args.push('--draft-max', String(sd.draftMax));
		if (sd.draftMin > 0) args.push('--draft-min', String(sd.draftMin));
		// Draft-model-only
		if (!isNgram && sd.draftPMin > 0) args.push('--draft-p-min', String(sd.draftPMin));
	}
	args.push('--host', '0.0.0.0');
	args.push('--port', String(params.port));
	// Injected extra args (e.g., --slot-save-path)
	if (extraArgs) {
		for (const [key, value] of Object.entries(extraArgs)) {
			args.push(`--${key}`, value);
		}
	}
	// Extra args — tokenize respecting quoted JSON values
	if (params.extraArgs.trim()) {
		const tokens = shellParse(params.extraArgs).filter((t): t is string => typeof t === 'string');
		args.push(...tokens);
	}
	return args;
}
// Async wrapper that injects checkpoint path
export async function buildServerArgs(
	modelPath: string,
	mmprojPath: string | null,
	params: ILaunchParams,
	defaultArgs: string[],
): Promise<string[]> {
	const checkpointDir = await getCheckpointsDir();
	return buildArgs(modelPath, mmprojPath, params, defaultArgs, { 'slot-save-path': checkpointDir });
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
            
			// Send SIGTERM to process tree
            try {
                killProcessTree(pidToUse!, 'SIGTERM');
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
                        killProcessTree(pidToUse!, 'SIGKILL');
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
                killProcessTree(pid, 'SIGTERM');
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
                        killProcessTree(pid, 'SIGKILL');
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

/**
 * Parse CLI flags into a map, handling quoted values and various formats
 */
export function parseCliFlags(flags: string): Map<string, string | true> {
	const result = new Map<string, string | true>();
	
	if (!flags?.trim()) return result;
	
	// Tokenize respecting quotes via shell-quote
	const tokens: string[] = shellParse(flags).filter((t): t is string => typeof t === 'string');
	
	// Parse tokens into flags
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (!token) continue;
		
		if (token.startsWith('--')) {
			// Check for --key=value format
			const equalsIndex = token.indexOf('=');
			if (equalsIndex !== -1) {
				const key = token.substring(0, equalsIndex);
				const value = token.substring(equalsIndex + 1);
				result.set(key, value);
			} else {
				// Check if next token is a value (not another flag)
				const nextToken = tokens[i + 1];
				if (nextToken && typeof nextToken === 'string' && !nextToken.startsWith('--')) {
					result.set(token, nextToken);
					i++; // Skip the value token
				} else {
					// Boolean flag
					result.set(token, true);
				}
			}
		}
	}
	
	return result;
}


/**
 * Merge CLI flags with override flags taking precedence
 */
export function mergeCliFlags(baseFlags: string, overrideFlags: string): string {
	const merged = parseCliFlags(baseFlags);
	const overrides = parseCliFlags(overrideFlags);
	
	// Apply overrides
	overrides.forEach((value, key) => {
		merged.set(key, value);
	});
	
	// Reconstruct CLI string
	const parts: string[] = [];
	merged.forEach((value, key) => {
		if (value === true) {
			parts.push(key); // Boolean flag
		} else {
			// Quote values containing spaces or JSON; use single quotes so inner "..." survive
			const needsQuoting = value.includes(' ') || value.startsWith('{') || value.startsWith('[');
			if (needsQuoting) {
				// Escape any single quotes in value using shell-safe '\'' pattern
				const escaped = value.replace(/'/g, `'\\''`);
				parts.push(key, `'${escaped}'`);
			} else {
				parts.push(key, value);
			}
		}
	});
	
	return parts.join(' ');
}

export async function findAvailablePort(): Promise<number> {
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	for (let port = settings.portRangeStart; port <= settings.portRangeEnd; port++) {
		if (!usedPorts.has(port)) {
			usedPorts.add(port);
			return port;
		}
	}
	throw new Error('No available ports in configured range');
}

// On startup, reconcile stored servers with actual running processes
export async function reconcileServers(): Promise<void> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	for (const server of servers) {
		if (server.status === EServerStatus.RUNNING || server.status === EServerStatus.LOADING) {
			if (server.pid && isProcessAlive(server.pid)) {
				usedPorts.add(server.port);
			} else {
				server.status = EServerStatus.STOPPED;
				server.pid = undefined;
				await store.put(SERVERS_PREFIX + server.id, server);
			}
		}
	}
}

// Launch servers with autoLaunch=true that are not already running
export async function launchAutoStartServers(): Promise<void> {
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	for (const server of servers) {
		if ((server.autoLaunch ?? false) && server.status === EServerStatus.STOPPED) {
			try {
				await launchServer(server);
				console.log(`[WarpCore] Auto-launching server: ${server.serverName}`);
			} catch (err) {
				console.log(`[WarpCore] Skipping auto-launch for ${server.serverName}: ${err}`);
			}
		}
	}
}

// Common server spawn logic — resolves backend, builds args, spawns, sets PID + status.
// Mutates server.pid, server.status, server.error, server.port. Persists to store.
// Throws if backend resolution fails.
export async function launchServer(server: IServer): Promise<void> {
	let backend: IBackend | null = null;
	if (server.backendGroupId) {
		const group = await store.get<IBackendGroup>('backendGroups:' + server.backendGroupId);
		if (!group) throw new Error('Backend group not found');
		backend = await store.get<IBackend>('backends:' + group.activeBackendId);
		if (!backend) throw new Error('Active backend in group not found');
	} else if (server.backendId) {
		backend = await store.get<IBackend>('backends:' + server.backendId);
		if (!backend) throw new Error('Backend not found');
	}
	if (!backend) throw new Error('No backend or backend group configured');

	const model = getCachedModels().find(m => m.primaryFile?.filePath === server.modelPath);
	const mmprojPath = model?.mmprojFile?.filePath && server.useMultiModal ? model.mmprojFile.filePath : null;

	// Append recommended inference params to extraArgs if enabled
	const launchParams = { ...server.params };
	if (server.useRecommendedInferenceParams && model?.recommendedInferenceParams) {
		launchParams.extraArgs = mergeCliFlags(model.recommendedInferenceParams, server.params.extraArgs);
	}
	// Use -ngl 999 when all layers are offloaded (GGUF parser may miss output layers)
	if (model?.primaryFile?.metadata?.nLayers && launchParams.gpuLayers >= model.primaryFile.metadata.nLayers) {
		launchParams.gpuLayers = 999;
	}

	// Auto-assign port if not yet determined
	if (server.port === 0) {
		server.port = await findAvailablePort();
	}
	if (launchParams.port === 0) {
		launchParams.port = server.port;
	}
	if (server.params.port > 0) {
		usedPorts.add(server.port);
	}

	const args = await buildServerArgs(
		server.modelPath,
		mmprojPath,
		launchParams,
		backend.defaultArgs,
	);

	const pid = spawnServer(
		server.id,
		backend.path,
		args,
		async (status, error) => {
			server.status = status;
			if (error) server.error = error;
			if (status === EServerStatus.RUNNING) server.startedAt = Date.now();
			await store.put(SERVERS_PREFIX + server.id, server);
		},
	);

	server.pid = pid || undefined;
	server.status = EServerStatus.LOADING;
	server.error = null;
	await store.put(SERVERS_PREFIX + server.id, server);
}