import { Router } from 'express';
import { store } from '../util/store';
import { isProxyOnline } from '../services/modelProxy';
import type { IServer, IBackend } from '@warpcore/shared';
import { EServerStatus } from '@warpcore/shared';

const SERVERS_PREFIX = 'servers:';
const BACKENDS_PREFIX = 'backends:';

export const summaryRouter = Router();

summaryRouter.get('/', async (_req, res) => {
	// Count running servers
	const servers = await store.list<IServer>(SERVERS_PREFIX);
	const running = servers.filter(s => s.status === EServerStatus.RUNNING).length;

	// Unique devices across all backends
	const backends = await store.list<IBackend>(BACKENDS_PREFIX);
	const deviceNames = new Set<string>();
	for (const backend of backends) {
		if (backend.detectedDevices) {
			for (const device of backend.detectedDevices) deviceNames.add(device.name);
		}
	}

	res.json({
		ok: true,
		data: {
			servers: { running },
			router: { online: isProxyOnline() },
			devices: { unique: deviceNames.size },
		},
		error: null,
	});
});