import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const updateRouter = Router();

interface IReleaseInfo {
	version: string;
	updateCheckUrl: string;
	downloadUrl: string;
	notes: string;
}

function getLocalRelease(): IReleaseInfo {
	// Walk up from server/src/routes to repo root
	const candidates = [
		path.join(__dirname, '..', '..', '..', '..', 'release.json'),
		path.join(__dirname, '..', '..', '..', 'release.json'),
		path.join(__dirname, '..', '..', 'release.json'),
	];
	for (const p of candidates) {
		if (fs.existsSync(p)) {
			return JSON.parse(fs.readFileSync(p, 'utf8'));
		}
	}
	return { version: '0.0.0', updateCheckUrl: '', downloadUrl: '', notes: '' };
}

// GET /api/update/check
updateRouter.get('/check', async (_req, res) => {
	const local = getLocalRelease();

	if (!local.updateCheckUrl) {
		res.json({
			ok: true,
			data: { currentVersion: local.version, latestVersion: local.version, updateAvailable: false, downloadUrl: '', notes: '' },
			error: null,
		});
		return;
	}

	try {
		const response = await fetch(local.updateCheckUrl, { signal: AbortSignal.timeout(5000) });
		if (!response.ok) {
			res.json({
				ok: true,
				data: { currentVersion: local.version, latestVersion: local.version, updateAvailable: false, downloadUrl: '', notes: '' },
				error: 'Failed to check for updates',
			});
			return;
		}

		const remote = await response.json() as IReleaseInfo;
		const updateAvailable = compareVersions(remote.version, local.version) > 0;

		res.json({
			ok: true,
			data: {
				currentVersion: local.version,
				latestVersion: remote.version,
				updateAvailable,
				downloadUrl: remote.downloadUrl,
				notes: remote.notes,
			},
			error: null,
		});
	} catch {
		// Silently fail — update check is non-critical
		res.json({
			ok: true,
			data: { currentVersion: local.version, latestVersion: local.version, updateAvailable: false, downloadUrl: '', notes: '' },
			error: null,
		});
	}
});

// GET /api/update/version
updateRouter.get('/version', (_req, res) => {
	const local = getLocalRelease();
	res.json({ ok: true, data: { version: local.version }, error: null });
});

// Simple semver comparison: returns >0 if a > b, 0 if equal, <0 if a < b
function compareVersions(a: string, b: string): number {
	const pa = a.replace(/^v/, '').split('.').map(Number);
	const pb = b.replace(/^v/, '').split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}
