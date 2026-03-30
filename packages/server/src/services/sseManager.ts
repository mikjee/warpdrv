import type { Request, Response } from 'express';
import { createSession } from 'better-sse';

export class SSEManager {
	private sessions: Array<{ session: any; req: Request; res: Response }> = [];
	private intervals: Record<string, { callback: () => unknown | null; intervalMs: number; timer: NodeJS.Timeout }>;
	private connectHandlers: Record<string, Array<() => Promise<unknown>>>;
	private disconnectHandlers: Record<string, Array<() => Promise<unknown>>>;

	constructor() {
		this.intervals = {};
		this.connectHandlers = {};
		this.disconnectHandlers = {};
	}

	onInterval(channel: string, callback: () => (Promise<unknown | null> | unknown | null), intervalMs: number): void {
		if (this.intervals[channel]) throw (`[SSE] Channel '${channel}' already registered. Possible duplicate registration.`);

		const timer = setInterval(async () => {
			const data = await callback();
			if (data !== null) this.emit(channel, data);
			
		}, intervalMs);

		this.intervals[channel] = { callback, intervalMs, timer };
	}

	onConnect(channel: string, handler: () => Promise<unknown>): void {
		if (!this.connectHandlers[channel]) {
			this.connectHandlers[channel] = [];
		}
		this.connectHandlers[channel].push(handler);
	}

	onDisconnect(channel: string, handler: () => Promise<unknown>): void {
		if (!this.disconnectHandlers[channel]) {
			this.disconnectHandlers[channel] = [];
		}
		this.disconnectHandlers[channel].push(handler);
	}

	emit(channel: string, data: unknown): void {
		if (this.sessions.length === 0) return;
		const payload = { channel, data };

		for (let i = this.sessions.length - 1; i >= 0; i--) {
			const session = this.sessions[i];
			if (!session) continue;
			try {
				session.session.push(payload);
			} catch (err) {
				console.error(`[SSE] Failed to push to connection:`, err);
				this.sessions.splice(i, 1);
			}
		}
	}

	async handleConnection(req: Request, res: Response, onDisconnect: () => void): Promise<void> {
		console.log('[SSE] New connection established');

		try {
			const session = await createSession(req, res);
			const sessionInfo = { session, req, res };
			this.sessions.push(sessionInfo);
			console.log(`[SSE] Total connections: ${this.sessions.length}`);

			for (const channel of Object.keys(this.connectHandlers)) {
				const handlers = this.connectHandlers[channel];
				if (!handlers) continue;
				for (const handler of handlers) {
					try {
						const data = await handler();
						if (data !== undefined) this.emit(channel, data);
					} catch (err) {
						console.error(`[SSE] Connect handler error for ${channel}:`, err);
					}
				}
			}

			await new Promise<void>((resolve, reject) => {
				req.on('close', () => resolve());
				req.on('error', () => resolve());
			});
		} catch (err) {
			console.error('[SSE] Failed to create session:', err);
		} finally {
			const idx = this.sessions.findIndex(s => s.req === req);
			if (idx > -1) this.sessions.splice(idx, 1);
			onDisconnect();
			(async () => {
				for (const channel of Object.keys(this.disconnectHandlers)) {
					const handlers = this.disconnectHandlers[channel];
					if (!handlers) continue;
					for (const handler of handlers) {
						try { await handler(); } catch {}
					}
				}
			})();
		}
	}
}
