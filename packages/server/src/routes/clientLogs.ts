import { Router } from 'express';

export const clientLogsRouter = Router();

// POST /api/client-log — receive error logs from frontend
clientLogsRouter.post('/', (req, res) => {
	try {
		const { level, message, stack, url, extra } = req.body ?? {};
		console.error('[client]', { level, message, stack, url, extra });
		res.status(204).end();
	} catch {
		res.status(500).end();
	}
});
