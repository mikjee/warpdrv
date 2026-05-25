import os from 'os';
export interface IShellSpec {
	shell: string;
	args: string[];
}
export function getShellSpec(command: string): IShellSpec {
	const platform = os.platform();
	if (platform === 'win32') {
		return { shell: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', command] };
	}
	return { shell: '/bin/bash', args: ['-c', command] };
}
