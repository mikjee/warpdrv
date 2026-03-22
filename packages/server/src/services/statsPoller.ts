import http from 'http';
import type { IServerStats, ISlotStats } from '@warpcore/shared';

// In-memory stats per server
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
	progress?: number;
	slots_idle?: number;
	slots_processing?: number;
}

interface ISlotResponse {
	id: number;
	state: number; // 0 = idle, 1 = processing
	n_ctx: number;
	n_predict: number;
	prompt_tokens: number;
	prompt_tokens_processed: number;
	tokens_predicted: number;
	t_prompt_processing: number; // ms
	t_token_generation: number; // ms
}

export function startStatsPolling(serverId: string, port: number): void {
	// Don't double-poll
	if (pollers.has(serverId)) return;

	const interval = setInterval(async () => {
		const base = `http://127.0.0.1:${port}`;

		const health = await fetchJson<IHealthResponse>(`${base}/health`);
		if (!health) return;

		const slots = await fetchJson<ISlotResponse[]>(`${base}/slots`);

		const slotStats: ISlotStats[] = (slots ?? []).map((s) => ({
			id: s.id,
			state: s.state === 1 ? 'processing' as const : 'idle' as const,
			contextUsed: s.prompt_tokens + s.tokens_predicted,
			contextTotal: s.n_ctx,
			promptTokens: s.prompt_tokens,
			promptTokensProcessed: s.prompt_tokens_processed,
			tokensGenerated: s.tokens_predicted,
			promptSpeed: s.t_prompt_processing > 0 ? (s.prompt_tokens_processed / (s.t_prompt_processing / 1000)) : 0,
			genSpeed: s.t_token_generation > 0 ? (s.tokens_predicted / (s.t_token_generation / 1000)) : 0,
		}));

		const totalPromptTokens = slotStats.reduce((sum, s) => sum + s.promptTokensProcessed, 0);
		const totalGenTokens = slotStats.reduce((sum, s) => sum + s.tokensGenerated, 0);
		const totalPromptMs = (slots ?? []).reduce((sum, s) => sum + s.t_prompt_processing, 0);
		const totalGenMs = (slots ?? []).reduce((sum, s) => sum + s.t_token_generation, 0);

		const stats: IServerStats = {
			loadingProgress: health.status === 'loading model' ? (health.progress ?? 0) : health.status === 'ok' ? 1 : 0,
			isLoading: health.status === 'loading model',
			slotsIdle: health.slots_idle ?? 0,
			slotsProcessing: health.slots_processing ?? 0,
			promptSpeed: totalPromptMs > 0 ? (totalPromptTokens / (totalPromptMs / 1000)) : 0,
			genSpeed: totalGenMs > 0 ? (totalGenTokens / (totalGenMs / 1000)) : 0,
			tokensGenerated: totalGenTokens,
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
