import { spawn } from 'child_process';
import { getShellSpec } from '../util/shellCmd';
export const shellExecDefinition = {
	name: 'shell_exec',
	description: 'Execute a shell command. Uses bash on linux/mac, PowerShell on Windows.',
	inputSchema: {
		type: 'object',
		properties: {
			command: { type: 'string', description: 'Command string to execute.' },
			cwd: { type: 'string', description: 'Working directory (optional).' },
			timeout: { type: 'number', description: 'Timeout in milliseconds (default 60000).', default: 60000 },
		},
		required: ['command'],
	},
	resultLimit: 40960,
};
export async function shellExecHandler(args: { command: string; cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
	const spec = getShellSpec(args.command);
	const timeout = args.timeout ?? 60000;
	return await new Promise((resolve, reject) => {
		const child = spawn(spec.shell, spec.args, { cwd: args.cwd });
		let stdout = '';
		let stderr = '';
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeout);
		child.stdout.on('data', (d) => { stdout += d.toString(); });
		child.stderr.on('data', (d) => { stderr += d.toString(); });
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			if (timedOut) {
				stderr += `\n[shell_exec] Killed after ${timeout}ms timeout.`;
			}
			resolve({ stdout, stderr, exitCode: code });
		});
	});
}
