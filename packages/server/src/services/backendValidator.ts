import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type { IDevice } from '@warpcore/shared';
import { EDeviceBackendType } from '@warpcore/shared';

const execFileAsync = promisify(execFile);

interface IValidationResult {
	valid: boolean;
	version: string;
	devices: IDevice[];
	error: string | null;
}

// Run llama-server --list-devices to detect compiled backends
async function getVersion(binaryPath: string): Promise<string | null> {
	try {
		const cliPath = binaryPath.replace(/llama-server$/, 'llama-cli');
		const { stdout, stderr } = await execFileAsync(cliPath, ['--list-devices'], {
			timeout: 10000,
		});
		const output = stderr + stdout;

		const parts: string[] = [];

		// Detect CUDA - must say "CUDA devices" (not ROCm devices)
		if (output.match(/ggml_cuda_init: found \d+ CUDA devices/)) {
			parts.push('CUDA');
		}

		// Detect ROCm - can show as "ROCm devices" under ggml_cuda_init or ggml_rocm_init
		if (output.match(/ggml_cuda_init: found \d+ ROCm devices/) ||
			output.match(/ggml_rocm_init/i) ||
			output.match(/Available devices:.*\n.*ROCm\d:/s)) {
			parts.push('ROCm');
		}

		// Detect Vulkan - look for actual Vulkan device listings
		if (output.match(/Found \d+ Vulkan devices/i) ||
			output.includes('ggml_vulkan:')) {
			parts.push('Vulkan');
		}

		return parts.length > 0 ? parts.join(', ') : 'unknown';
	} catch {
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

		// Parse CUDA devices
		const cudaMatch = output.matchAll(/Device \d+: (.+?), compute capability (\S+), VMM: \w+, VRAM: (\d+) MiB/g);
		for (const match of cudaMatch) {
			devices.push({
				id: `cuda${devices.length}`,
				name: match[1]!,
				backendType: EDeviceBackendType.CUDA,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0, // will be updated at runtime
				connection: '',
			});
		}

		// Parse ROCm devices
		const rocmMatch = output.matchAll(/Device \d+: (.+?), (\w+) \(0x\w+\), VMM: \w+, Wave Size: \d+, VRAM: (\d+) MiB/g);
		for (const match of rocmMatch) {
			devices.push({
				id: `rocm${devices.length}`,
				name: match[1]!,
				backendType: EDeviceBackendType.ROCM,
				backendId,
				computeCapability: match[2]!,
				vramTotalMb: parseInt(match[3]!, 10),
				vramFreeMb: 0,
				connection: '',
			});
		}

		// Parse Vulkan devices
		const vulkanMatch = output.matchAll(/Vulkan\d+: (.+?) \((\d+) MiB, (\d+) MiB free\)/g);
		for (const match of vulkanMatch) {
			devices.push({
				id: `vulkan${devices.length}`,
				name: match[1]!,
				backendType: EDeviceBackendType.VULKAN,
				backendId,
				computeCapability: '',
				vramTotalMb: parseInt(match[2]!, 10),
				vramFreeMb: parseInt(match[3]!, 10),
				connection: '',
			});
		}

		// Also parse the simpler "Available devices:" format
		const availMatch = output.matchAll(/(CUDA|ROCm|Vulkan)(\d+): (.+?) \((\d+) MiB, (\d+) MiB free\)/g);
		for (const match of availMatch) {
			const existsAlready = devices.some(d =>
				d.name.includes(match[3]!.split('(')[0]!.trim()) && d.backendType === (match[1] as EDeviceBackendType)
			);
			if (!existsAlready) {
				devices.push({
					id: `${match[1]!.toLowerCase()}${match[2]}`,
					name: match[3]!,
					backendType: match[1] as EDeviceBackendType,
					backendId,
					computeCapability: '',
					vramTotalMb: parseInt(match[4]!, 10),
					vramFreeMb: parseInt(match[5]!, 10),
					connection: '',
				});
			}
		}
	} catch {
		// llama-cli might not exist or might fail
	}

	return devices;
}

// Full validation: check binary exists, get version, discover devices
export async function validateBackend(binaryPath: string, backendId: string): Promise<IValidationResult> {
	// Check file exists
	try {
		await fs.access(binaryPath, fs.constants.X_OK);
	} catch {
		return { valid: false, version: '', devices: [], error: 'Binary not found or not executable' };
	}

	// Get version
	const version = await getVersion(binaryPath);
	if (!version) {
		return { valid: false, version: '', devices: [], error: 'Failed to get version — binary may be invalid' };
	}

	// Discover devices
	const devices = await listDevices(binaryPath, backendId);

	return { valid: true, version, devices, error: null };
}
