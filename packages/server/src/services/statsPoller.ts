import http from 'http';
import type { IServerStats, ISlotStats } from '@warpcore/shared';

const statsMap = new Map<string, IServerStats>();
const pollers = new Map<string, ReturnType<typeof setInterval>>();

function fetchJson<T>(url: string): Promise<T | null> {
	return new Promise((resolve) => {
		const req = http.get(url, { timeout: 2000 }, (res) => {
			if (res.statusCode !== 200) { resolve(null); return; }
			let body = '';
			res.on('data', (chunk) => { body += chunk; });
			res.on('end', () => {
				try { resolve(JSON.parse(body) as T); }
				catch { resolve(null); }
			});
		});
		req.on('error', () => resolve(null));
		req.on('timeout', () => { req.destroy(); resolve(null); });
	});
}

interface IHealthResponse {
	status: string;
	slots_idle?: number;
	slots_processing?: number;
}

interface ISlotNextToken {
	has_next_token: boolean;
	n_remain: number;
	n_decoded: number;
}

interface ISlotResponse {
	id: number;
	n_ctx: number;
	is_processing: boolean;
	next_token?: ISlotNextToken[];
}

export function startStatsPolling(serverId: string, port: number): void {
	if (pollers.has(serverId)) return;

	const interval = setInterval(async () => {
		const base = `http://127.0.0.1:${port}`;

		const health = await fetchJson<IHealthResponse>(`${base}/health`);
		if (!health) return;

		const slots = await fetchJson<ISlotResponse[]>(`${base}/slots`);

		const slotStats: ISlotStats[] = (slots ?? []).map((s) => {
			const nextToken = s.next_token?.[0];
			const nDecoded = nextToken?.n_decoded ?? 0;
			const nRemain = nextToken?.n_remain ?? 0;
			const contextUsed = nDecoded > 0 ? (s.n_ctx - nRemain) : 0;

			return {
				id: s.id,
				state: s.is_processing ? 'processing' as const : 'idle' as const,
				contextUsed,
				contextTotal: s.n_ctx,
				tokensGenerated: nDecoded,
				tokensRemaining: nRemain,
			};
		});

		const totalGenerated = slotStats.reduce((sum, s) => sum + s.tokensGenerated, 0);
		const processingCount = slotStats.filter(s => s.state === 'processing').length;
		const idleCount = slotStats.filter(s => s.state === 'idle').length;

		const stats: IServerStats = {
			slotsIdle: health.slots_idle ?? idleCount,
			slotsProcessing: health.slots_processing ?? processingCount,
			tokensGenerated: totalGenerated,
			slots: slotStats,
		};

		statsMap.set(serverId, stats);
	}, 1500);

	pollers.set(serverId, interval);
}

export function stopStatsPolling(serverId: string): void {
	const interval = pollers.get(serverId);
	if (interval) {
		clearInterval(interval);
		pollers.delete(serverId);
	}
	statsMap.delete(serverId);
}

export function getServerStats(serverId: string): IServerStats | null {
	return statsMap.get(serverId) ?? null;
}