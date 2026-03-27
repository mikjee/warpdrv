import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { store } from '../util/store';
import {
	startDownload,
	startMultiPartDownload,
	pauseDownload,
	resumeDownload,
	cancelDownload,
	getAllDownloads,
	clearDownloadHistory,
} from '../services/downloadManager';
import type { ISettings, IDownloadRequestPayload, IHubFile } from '@warpcore/shared';
import { DEFAULT_SETTINGS } from '@warpcore/shared';
import {
	fetchAllGgufFiles,
	mapFilesToHubFiles,
	processGgufFiles,
} from '../services/hubParser';

const SETTINGS_KEY = 'settings:general';
const HF_API = 'https://huggingface.co/api';

export const hubRouter = Router();

// GET /api/hub/search?q=&sort=&order=&params_min=&params_max=
hubRouter.get('/search', async (req, res) => {
	const q = (req.query.q as string) ?? '';
	const sort = (req.query.sort as string) ?? 'downloads';
	const order = (req.query.order as string) ?? 'desc';
	const paramsMin = parseInt(req.query.params_min as string) || 0;
	const paramsMax = parseInt(req.query.params_max as string) || 0;

	if (!q.trim()) {
		res.json({ ok: true, data: [], error: null });
		return;
	}

	try {
		const direction = order === 'asc' ? '1' : '-1';

		const params = new URLSearchParams({
			search: q.trim(),
			filter: 'gguf',
			sort: sort === 'modified' ? 'lastModified' : sort === 'created' ? 'createdAt' : sort,
			direction,
			limit: '100',
		});

		const response = await fetch(`${HF_API}/models?${params}`);
		if (!response.ok) {
			res.json({ ok: false, data: [], error: `HuggingFace API returned ${response.status}` });
			return;
		}

		const raw = await response.json() as Record<string, unknown>[];
		const models = raw.map((m: Record<string, unknown>) => ({
			id: String(m.id ?? ''),
			author: String(m.id ?? '').split('/')[0] ?? '',
			modelId: String(m.id ?? '').split('/')[1] ?? '',
			downloads: Number(m.downloads ?? 0),
			likes: Number(m.likes ?? 0),
			lastModified: String(m.lastModified ?? ''),
			createdAt: String(m.createdAt ?? ''),
			tags: (m.tags as string[]) ?? [],
			pipelineTag: String(m.pipeline_tag ?? ''),
		}));

		// Client-side param filtering (HF API doesn't support this directly)
		// We filter by checking tags for param count hints
		const filtered = models.filter(m => {
			if (paramsMin <= 0 && paramsMax <= 0) return true;
			// Try to extract param count from tags or model name
			const allText = [...m.tags, m.modelId, m.id].join(' ');
			const paramMatch = allText.match(/(\d+\.?\d*)[Bb]/);
			if (!paramMatch) return true; // can't determine, include it
			const paramB = parseFloat(paramMatch[1]!);
			if (paramsMin > 0 && paramB < paramsMin) return false;
			if (paramsMax > 0 && paramB > paramsMax) return false;
			return true;
		});

		res.json({ ok: true, data: filtered, error: null });
	} catch (err) {
		res.json({ ok: false, data: [], error: String(err) });
	}
});

// GET /api/hub/model/:author/:name
hubRouter.get('/model/:author/:name', async (req, res) => {
	const { author, name } = req.params;
	const modelId = `${author}/${name}`;

	try {
		// Fetch model info
		const infoRes = await fetch(`${HF_API}/models/${modelId}`);
		if (!infoRes.ok) {
			res.status(404).json({ ok: false, data: null, error: 'Model not found' });
			return;
		}
		const info = await infoRes.json() as Record<string, unknown>;

		// Get model roots to check downloaded status
		const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;

		// Fetch all GGUF files including from nested directories (one level deep)
		const rawGgufFiles = await fetchAllGgufFiles(author!, name!, 'main');

		// Map to IHubFile format with download status
		const mappedFiles = mapFilesToHubFiles(rawGgufFiles, author!, name!, settings.modelRoots);

		// Process GGUF files to add shard info and parent model grouping
		const files = processGgufFiles(mappedFiles) as IHubFile[];

		// Fetch README
		let readme = '';
		try {
			const readmeRes = await fetch(`https://huggingface.co/${modelId}/resolve/main/README.md`);
			if (readmeRes.ok) readme = await readmeRes.text();
		} catch {}

		const detail = {
			id: modelId,
			author: author!,
			modelId: name!,
			downloads: Number(info.downloads ?? 0),
			likes: Number(info.likes ?? 0),
			lastModified: String(info.lastModified ?? ''),
			createdAt: String(info.createdAt ?? ''),
			tags: (info.tags as string[]) ?? [],
			pipelineTag: String(info.pipeline_tag ?? ''),
			files,
			readme,
		};

		res.json({ ok: true, data: detail, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});

// POST /api/hub/download
hubRouter.post('/download', async (req, res) => {
	const payload = req.body as IDownloadRequestPayload;

	console.log('[HubRoute] Download request received:', {
		author: payload.author,
		modelName: payload.modelName,
		filename: payload.filename,
		destRoot: payload.destRoot,
		fileParts: payload.fileParts ?? [],
	});

	if (!payload.author || !payload.modelName || !payload.filename || !payload.destRoot) {
		res.status(400).json({ ok: false, data: null, error: 'Missing required fields' });
		return;
	}

	// Verify destRoot is a configured model root
	const settings = await store.get<ISettings>(SETTINGS_KEY) ?? DEFAULT_SETTINGS;
	if (!settings.modelRoots.includes(payload.destRoot)) {
		res.status(400).json({ ok: false, data: null, error: 'Destination is not a configured model directory' });
		return;
	}

	try {
		// If fileParts provided, start all parts simultaneously
		if (payload.fileParts && payload.fileParts.length > 1) {
			const downloadIds = await startMultiPartDownload(
				payload.author,
				payload.modelName,
				payload.fileParts,
				payload.destRoot,
			);
			res.json({ ok: true, data: { downloadIds, fileParts: payload.fileParts }, error: null });
		} else {
			// Single file download
			const dl = await startDownload(
				payload.author,
				payload.modelName,
				payload.filename,
				payload.destRoot,
				payload.fileParts ?? [payload.filename],
				0,
			);
			res.json({ ok: true, data: dl, error: null });
		}
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});

// GET /api/hub/downloads
hubRouter.get('/downloads', async (_req, res) => {
	const downloads = await getAllDownloads();
	res.json({ ok: true, data: downloads, total: downloads.length, error: null });
});

// POST /api/hub/downloads/:id/pause
hubRouter.post('/downloads/:id/pause', async (req, res) => {
	const ok = await pauseDownload(req.params.id!);
	res.json({ ok, data: null, error: ok ? null : 'Download not found or not active' });
});

// POST /api/hub/downloads/:id/resume
hubRouter.post('/downloads/:id/resume', async (req, res) => {
	const ok = await resumeDownload(req.params.id!);
	res.json({ ok, data: null, error: ok ? null : 'Download not found or not paused' });
});

// POST /api/hub/downloads/:id/cancel
hubRouter.post('/downloads/:id/cancel', async (req, res) => {
	const ok = await cancelDownload(req.params.id!);
	res.json({ ok, data: null, error: ok ? null : 'Download not found' });
});

// DELETE /api/hub/downloads/history
hubRouter.delete('/downloads/history', async (_req, res) => {
	await clearDownloadHistory();
	res.json({ ok: true, data: null, error: null });
});
