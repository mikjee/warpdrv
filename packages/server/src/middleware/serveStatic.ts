import express from 'express';
import path from 'path';
import fs from 'fs';

export function serveStaticApp(app: express.Express): void {
	const candidates = [
		process.env.WARPCORE_RESOURCE_DIR ? path.join(process.env.WARPCORE_RESOURCE_DIR, 'app-dist') : '',
		path.join(path.dirname(process.execPath), 'app-dist'),
		path.join(process.cwd(), 'app-dist'),
		path.join(process.cwd(), '..', 'app', 'dist'),
	].filter(Boolean);

	let staticDir: string | null = null;
	for (const dir of candidates) {
		const resolved = path.resolve(dir);
		if (fs.existsSync(path.join(resolved, 'index.html'))) {
			staticDir = resolved;
			break;
		}
	}

	if (!staticDir) {
		console.log('[WarpCore] No frontend build found — API only mode');
		console.log('[WarpCore] WARPCORE_RESOURCE_DIR:', process.env.WARPCORE_RESOURCE_DIR);
		console.log('[WarpCore] execPath:', process.execPath);
		console.log('[WarpCore] cwd:', process.cwd());
		return;
	}

	console.log(`[WarpCore] Serving frontend from ${staticDir}`);

	app.use(express.static(staticDir, { index: 'index.html' }));

	app.use((req, res, next) => {
		if (req.path.startsWith('/api')) return next();
		res.sendFile(path.join(staticDir!, 'index.html'));
	});
}