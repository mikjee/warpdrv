import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import type { IWhisperBackend } from '@warpcore/shared';
import { EValidationStatus } from '@warpcore/shared';

const execFileAsync = promisify(execFile);

interface IWhisperValidationResult {
	valid: boolean;
	version: string;
	error: string | null;
}

export async function validateWhisperBackend(binaryPath: string): Promise<IWhisperValidationResult> {
	try {
		await fs.access(binaryPath, fs.constants.X_OK);
	} catch {
		return { valid: false, version: '', error: 'Binary not found or not executable' };
	}

	try {
		const { stdout, stderr } = await execFileAsync(binaryPath, ['--help'], {
			timeout: 10000,
		});
		const output = stdout + stderr;

		// Parse version from whisper-server output
		const versionMatch = output.match(/version\s+v?(\d+\.\d+[\.\d]*)/i);
		const version = versionMatch ? versionMatch[1]! : 'unknown';

		return { valid: true, version, error: null };
	} catch (err) {
		return { valid: false, version: '', error: err instanceof Error ? err.message : 'Failed to validate binary' };
	}
}
