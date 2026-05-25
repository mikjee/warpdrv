import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type { IDevice } from '@warpcore/shared';
import { EDeviceBackendType } from '@warpcore/shared';
const execFileAsync = promisify(execFile);
interface IBuildInfo {
	buildNumber: string;
	gitCommit: string;
}

interface IValidationResult {
	valid: boolean;
	version: string;
	buildInfo: IBuildInfo | null;
	devices: IDevice[];
	error: string | null;
}

// Run llama-server --version to get build number and git commit hash
async function getBuildInfo(binaryPath: string): Promise<IBuildInfo | null> {
	try {
		const { stdout, stderr } = await execFileAsync(binaryPath, ['--version'], {
			timeout: 10000,
		});
		const output = stderr + stdout;
		console.log(`[getBuildInfo] output for ${binaryPath}:`, JSON.stringify(output));
		const match = output.match(/version:\s*(\d+)\s*\(([a-f0-9]+)\)/);
		if (match) {
			const info = { buildNumber: match[1]!, gitCommit: match[2]! };
			console.log(`[getBuildInfo] matched:`, info);
			return info;
		}
		console.log(`[getBuildInfo] no match for ${binaryPath}`);
		return null;
	} catch (err) {
		console.log(`[getBuildInfo] error for ${binaryPath}:`, String(err));
		return null;
	}
}

// Run llama-cli --list-devices to detect compiled backends
// New builds (>= 9100) only show Available devices section
// Old builds show verbose CUDA/ROCm/Vulkan init lines
async function getVersion(binaryPath: string, buildNumber: number): Promise<string | null> {
	try {
		const cliPath = binaryPath.replace(/llama-server$/, 'llama-cli');
		const { stdout, stderr } = await execFileAsync(cliPath, ['--list-devices'], {
			timeout: 10000,
		});
		const output = stderr + stdout;
		console.log(`[getVersion] buildNumber=${buildNumber}, output for ${binaryPath}:`, JSON.stringify(output));

		const parts: string[] = [];

		if (buildNumber >= 9100) {
			// New builds: detect GPU backends from Available devices section
			const deviceTypeMatch = output.match(/Available devices:.*\n\s+(CUDA|ROCm|Vulkan)\d:/s);
			if (deviceTypeMatch) {
				parts.push(deviceTypeMatch[1]);
			}
			console.log(`[getVersion] new build detection, parts:`, parts);
		} else {
			// Old builds: detect from verbose init lines
			if (output.match(/ggml_cuda_init: found \d+ CUDA devices/)) {
				parts.push('CUDA');
			}
			if (output.match(/ggml_cuda_init: found \d+ ROCm devices/) ||
				output.match(/ggml_rocm_init/i) ||
				output.match(/Available devices:.*\n.*ROCm\d:/s)) {
				parts.push('ROCm');
			}
			if (output.match(/Found \d+ Vulkan devices/i) ||
				output.includes('ggml_vulkan:')) {
				parts.push('Vulkan');
			}
			console.log(`[getVersion] old build detection, parts:`, parts);
		}

		return parts.length > 0 ? parts.join(', ') : 'unknown';
	} catch (err) {
		console.log(`[getVersion] error for ${binaryPath}:`, String(err));
		return null;
	}
}
// Run llama-cli --list-devices to discover available GPUs
async function listDevices(binaryPath: string, backendId: string): Promise<IDevice[]> {
	// llama-cli is in the same directory as llama-server
	const cliPath = binaryPath.replace(/llama-server$/, 'llama-cli');
	const devices: IDevice[] = [];
	try {
		const { stdout, stderr } = await execFileAsync(cliPath, ['--list-devices'], {
			timeout: 15000,
		});
		const output = stderr + stdout;
		// Primary parser: "Available devices:" section at the end
		// This is the most reliable format and matches what llama-server expects
		// Format: "  CUDA0: Name (VRAM MiB, FREE MiB free)"
		const availMatch = output.matchAll(/\s+(CUDA|ROCm|Vulkan)(\d+): (.+?) \((\d+) MiB, (\d+) MiB free\)/g);
		for (const match of availMatch) {
			const backendType = match[1] as string;
			const deviceIndex = match[2] as string;
			// Use the exact ID format llama-server expects: "CUDA0", "Vulkan1", etc.
			const deviceId = `${backendType}${deviceIndex}`;
			const backendTypeEnum = backendType === 'CUDA' ? EDeviceBackendType.CUDA
				: backendType === 'ROCm' ? EDeviceBackendType.ROCM
				: EDeviceBackendType.VULKAN;
			devices.push({
				id: deviceId,
				name: match[3]!,
				backendType: backendTypeEnum,
				backendId,
				computeCapability: '',
				vramTotalMb: parseInt(match[4]!, 10),
				vramFreeMb: parseInt(match[5]!, 10),
				connection: '',
			});
		}
		// If the "Available devices:" section was found, use those results
		// Otherwise fall back to parsing the verbose init output
		if (devices.length > 0) {
			// Enrich with compute capability from verbose output
			const cudaCapMatch = output.matchAll(/Device \d+: (.+?), compute capability (\S+)/g);
			for (const match of cudaCapMatch) {
				const deviceName = match[1]!;
				const cap = match[2]!;
				const dev = devices.find(d => d.backendType === EDeviceBackendType.CUDA && d.name.includes(deviceName));
				if (dev) dev.computeCapability = cap;
			}
			const rocmCapMatch = output.matchAll(/Device \d+: (.+?), (\w+) \(0x\w+\)/g);
			for (const match of rocmCapMatch) {
				const deviceName = match[1]!;
				const cap = match[2]!;
				const dev = devices.find(d => d.backendType === EDeviceBackendType.ROCM && d.name.includes(deviceName));
				if (dev) dev.computeCapability = cap;
			}
			return devices;
		}
		// Fallback: parse verbose init output for older llama.cpp builds
		// that don't have the "Available devices:" section
		// Parse CUDA devices
		let cudaIdx = 0;
		const cudaMatch = output.matchAll(/Device \d+: (.+?), compute capability (\S+), VMM: \w+, VRAM: (\d+) MiB/g);
		for (const match of cudaMatch) {
			devices.push({
				id: `CUDA${cudaIdx}`,
				name: match[1]!,
				backendType: EDeviceBackendType.CUDA,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0,
				connection: '',
			});
			cudaIdx++;
		}
		// Parse ROCm devices
		let rocmIdx = 0;
		const rocmMatch = output.matchAll(/Device \d+: (.+?), (\w+) \(0x\w+\), VMM: \w+, Wave Size: \d+, VRAM: (\d+) MiB/g);
		for (const match of rocmMatch) {
			devices.push({
				id: `ROCm${rocmIdx}`,
				name: match[1]!,
				backendType: EDeviceBackendType.ROCM,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0,
				connection: '',
			});
			rocmIdx++;
		}
		// Parse Vulkan devices
		let vulkanIdx = 0;
		const vulkanVerboseMatch = output.matchAll(/ggml_vulkan: (\d+) = (.+?) \|/g);
		for (const match of vulkanVerboseMatch) {
			// Only add if not already covered
			const idx = parseInt(match[1]!, 10);
			const name = match[2]!.trim();
			const exists = devices.some(d => d.backendType === EDeviceBackendType.VULKAN && d.name.includes(name.split('(')[0]!.trim()));
			if (!exists) {
				devices.push({
					id: `Vulkan${idx}`,
					name,
					backendType: EDeviceBackendType.VULKAN,
					backendId,
					computeCapability: '',
					vramTotalMb: 0,
					vramFreeMb: 0,
					connection: '',
				});
			}
			vulkanIdx++;
		}
	} catch {
		// llama-cli might not exist or might fail
	}
	return devices;
}
// Full validation: check binary exists, get build info, version, discover devices
export async function validateBackend(binaryPath: string, backendId: string): Promise<IValidationResult> {
	// Check file exists
	try {
		await fs.access(binaryPath, fs.constants.X_OK);
	} catch {
		return { valid: false, version: '', buildInfo: null, devices: [], error: 'Binary not found or not executable' };
	}
	// Get build info first (needed for version detection logic)
	const buildInfo = await getBuildInfo(binaryPath);
	const buildNumber = buildInfo ? parseInt(buildInfo.buildNumber, 10) : 0;
	console.log(`[validateBackend] binary=${binaryPath}, buildNumber=${buildNumber}`);
	// Get GPU backend version (uses buildNumber to choose detection logic)
	const version = await getVersion(binaryPath, buildNumber);
	if (!version) {
		return { valid: false, version: '', buildInfo, devices: [], error: 'Failed to get version — binary may be invalid' };
	}
	// Discover devices
	const devices = await listDevices(binaryPath, backendId);
	const result = { valid: true, version, buildInfo, devices, error: null };
	console.log(`[validateBackend] result for ${binaryPath}:`, JSON.stringify({ ...result, devices: result.devices.map(d => ({ ...d, backendId: d.backendId })) }));
	return result;
}