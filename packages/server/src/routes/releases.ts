import { Router } from 'express';
import { fetchLlamaReleases, fetchLlamaReleasesForOs, fetchWhisperReleases, fetchWhisperReleasesForOs } from '../services/releases';
import type { TOs } from '../services/hardware';
export const releasesRouter = Router();
releasesRouter.get('/llama', async (req, res) => {
	try {
		const osFilter = req.query.os as string | undefined;
		const assets = osFilter
			? await fetchLlamaReleasesForOs(osFilter as TOs)
			: await fetchLlamaReleases();
		res.json({ ok: true, data: assets, total: assets.length, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});
releasesRouter.get('/whisper', async (req, res) => {
	try {
		const osFilter = req.query.os as string | undefined;
		const assets = osFilter
			? await fetchWhisperReleasesForOs(osFilter as TOs)
			: await fetchWhisperReleases();
		res.json({ ok: true, data: assets, total: assets.length, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});
