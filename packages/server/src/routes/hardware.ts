import { Router } from 'express';
import { detectHardware } from '../services/hardware';
export const hardwareRouter = Router();
hardwareRouter.get('/', async (_req, res) => {
	try {
		const info = await detectHardware();
		res.json({ ok: true, data: info, error: null });
	} catch (err) {
		res.json({ ok: false, data: null, error: String(err) });
	}
});
