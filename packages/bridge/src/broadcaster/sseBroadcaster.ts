// ============================================================
// warpbridge/src/broadcaster/sseBroadcaster.ts
// Default broadcaster — uses better-sse Channel for pub/sub.
// HTTP routes register sessions directly via getChannel().register(session).
// In-process consumers can use subscribe() for callback-based delivery.
// ============================================================
import { createChannel, type Channel } from 'better-sse';
import type { IBridgeBroadcaster } from '../types/interfaces';
import type { IBridgeEvent } from '../types';

export class SseBroadcaster implements IBridgeBroadcaster {
	private channel: Channel;
	private localHandlers: Set<(event: IBridgeEvent) => void> = new Set();

	constructor() {
		this.channel = createChannel();
	}

	emit(event: IBridgeEvent): void {
		// Broadcast to all connected SSE sessions
		this.channel.broadcast(event, event.type);
		// Also fan out to in-process subscribers
		for (const handler of this.localHandlers) {
			try {
				handler(event);
			} catch {
				// Swallow handler errors so one bad subscriber can't break others
			}
		}
	}

	subscribe(handler: (event: IBridgeEvent) => void): () => void {
		this.localHandlers.add(handler);
		return () => this.localHandlers.delete(handler);
	}

	// Native channel access — used by HTTP routes to register sessions directly
	getNative(): Channel {
		return this.channel;
	}

	getChannel(): Channel {
		return this.channel;
	}
}