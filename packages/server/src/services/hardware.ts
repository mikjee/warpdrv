import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import type { TOs, TArch, TGpuVendor, IGpuInfo, IHardwareInfo } from '@warpcore/shared';
export type { TOs, TArch, TGpuVendor, IGpuInfo, IHardwareInfo };
function detectOs(): TOs {
	const p = os.platform();
	if (p === 'win32') return 'win';
	if (p === 'darwin') return 'mac';
	return 'linux';
}
function detectArch(): TArch {
	return os.arch() === 'arm64' ? 'arm64' : 'x64';
}
async function detectNvidia(): Promise<IGpuInfo[]> {
	try {
		const { stdout } = await execAsync('nvidia-smi --query-gpu=name,driver_version --format=csv,noheader');
		const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
		return lines.map(line => {
			const parts = line.split(',').map(s => s.trim());
			return {
				vendor: 'nvidia' as TGpuVendor,
				name: parts[0] ?? 'NVIDIA GPU',
				driverVersion: parts[1] ?? null,
			};
		});
	} catch {
		return [];
	}
}
async function detectAmdLinux(): Promise<IGpuInfo[]> {
	try {
		const { stdout } = await execAsync('rocm-smi --showproductname --csv');
		const lines = stdout.trim().split('\n').slice(1).filter(l => l.trim().length > 0);
		if (lines.length > 0) {
			return lines.map(line => {
				const parts = line.split(',').map(s => s.trim());
				return {
					vendor: 'amd' as TGpuVendor,
					name: parts[1] ?? parts[0] ?? 'AMD GPU',
					driverVersion: null,
				};
			});
		}
	} catch {}
	try {
		const { stdout } = await execAsync("lspci | grep -i 'vga\\|3d\\|display' | grep -i 'amd\\|ati\\|radeon'");
		const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
		return lines.map(line => ({
			vendor: 'amd' as TGpuVendor,
			name: line.split(':').slice(2).join(':').trim() || 'AMD GPU',
			driverVersion: null,
		}));
	} catch {
		return [];
	}
}
async function detectGpusWindows(): Promise<IGpuInfo[]> {
	const gpus: IGpuInfo[] = [];
	const nvidia = await detectNvidia();
	gpus.push(...nvidia);
	try {
		const { stdout } = await execAsync('wmic path win32_VideoController get name');
		const lines = stdout.trim().split('\n').slice(1).map(l => l.trim()).filter(l => l.length > 0);
		for (const line of lines) {
			const lower = line.toLowerCase();
			if (lower.includes('nvidia')) continue;
			let vendor: TGpuVendor = 'unknown';
			if (lower.includes('amd') || lower.includes('radeon')) vendor = 'amd';
			else if (lower.includes('intel')) vendor = 'intel';
			gpus.push({ vendor, name: line, driverVersion: null });
		}
	} catch {}
	return gpus;
}
async function detectGpusLinux(): Promise<IGpuInfo[]> {
	const gpus: IGpuInfo[] = [];
	const nvidia = await detectNvidia();
	gpus.push(...nvidia);
	const amd = await detectAmdLinux();
	gpus.push(...amd);
	try {
		const { stdout } = await execAsync("lspci | grep -i 'vga\\|3d\\|display' | grep -i intel");
		const lines = stdout.trim().split('\n').filter(l => l.trim().length > 0);
		for (const line of lines) {
			gpus.push({
				vendor: 'intel',
				name: line.split(':').slice(2).join(':').trim() || 'Intel GPU',
				driverVersion: null,
			});
		}
	} catch {}
	return gpus;
}
async function detectGpusMac(): Promise<IGpuInfo[]> {
	if (detectArch() === 'arm64') {
		return [{ vendor: 'apple', name: 'Apple Silicon GPU', driverVersion: null }];
	}
	try {
		const { stdout } = await execAsync('system_profiler SPDisplaysDataType');
		const matches = stdout.match(/Chipset Model:\s*(.+)/g) ?? [];
		return matches.map(m => {
			const name = m.replace(/Chipset Model:\s*/, '').trim();
			const lower = name.toLowerCase();
			let vendor: TGpuVendor = 'unknown';
			if (lower.includes('amd') || lower.includes('radeon')) vendor = 'amd';
			else if (lower.includes('intel')) vendor = 'intel';
			else if (lower.includes('apple')) vendor = 'apple';
			else if (lower.includes('nvidia')) vendor = 'nvidia';
			return { vendor, name, driverVersion: null };
		});
	} catch {
		return [];
	}
}
export async function detectHardware(): Promise<IHardwareInfo> {
	const osName = detectOs();
	const arch = detectArch();
	let gpus: IGpuInfo[] = [];
	if (osName === 'win') gpus = await detectGpusWindows();
	else if (osName === 'linux') gpus = await detectGpusLinux();
	else gpus = await detectGpusMac();
	return { os: osName, arch, gpus };
}
