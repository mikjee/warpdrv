import type { Request, Response } from 'express';

export class SSEManager {
	private connections: Response[];
	private intervals: Record<string, { callback: () => unknown | null; intervalMs: number; timer: NodeJS.Timeout }>;
	private connectHandlers: Record<string, Array<() => Promise<unknown>>>;
	private disconnectHandlers: Record<string, Array<() => Promise<unknown>>>;

	constructor() {
		this.connections = [];
		this.intervals = {};
		this.connectHandlers = {};
		this.disconnectHandlers = {};
	}

	onInterval(channel: string, callback: () => unknown | null, intervalMs: number): void {
		if (this.intervals[channel]) {
			console.warn(`[SSE] Channel '${channel}' already registered. Possible duplicate registration.`);
			return;
		}

		const timer = setInterval(() => {
			const data = callback();
			if (data !== null) {
				this.emit(channel, data);
			}
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
		const message = JSON.stringify({ channel, data });
		const event = `event: ${channel}\ndata: ${message}\n\n`;

		for (let i = this.connections.length - 1; i >= 0; i--) {
			const conn = this.connections[i];
			if (!conn) continue;
			try {
				conn.write(event);
			} catch {
				this.connections.splice(i, 1);
			}
		}
	}

	handleConnection(req: Request, res: Response, onDisconnect: () => void): void {
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('Access-Control-Allow-Origin', '*');

		this.connections.push(res);

		(async () => {
			for (const channel of Object.keys(this.connectHandlers)) {
				const handlers = this.connectHandlers[channel];
				if (!handlers) continue;
				for (const handler of handlers) {
					try {
						const data = await handler();
						if (data !== undefined) {
							this.emit(channel, data);
						}
					} catch (err) {
						console.error(`[SSE] Connect handler error for ${channel}:`, err);
					}
				}
			}
		})();

		const cleanup = () => {
			const idx = this.connections.indexOf(res);
			if (idx > -1) this.connections.splice(idx, 1);
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
		};

		req.on('close', cleanup);
		req.on('error', cleanup);
	}
}
