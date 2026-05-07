import type { IElicitationResponse } from '../types';

interface IPendingElicitation {
	resolve: (response: IElicitationResponse) => void;
	reject: (err: Error) => void;
	serverName: string;
	createdAt: number;
}

export class ElicitationRegistry {
	private pending: Record<string, IPendingElicitation> = {};

	register(id: string, serverName: string): Promise<IElicitationResponse> {
		return new Promise((resolve, reject) => {
			this.pending[id] = { resolve, reject, serverName, createdAt: Date.now() };
		});
	}

	resolve(id: string, response: IElicitationResponse): boolean {
		const entry = this.pending[id];
		if (!entry) return false;
		entry.resolve(response);
		delete this.pending[id];
		return true;
	}

	cancelAllForServer(serverName: string): string[] {
		const cancelled: string[] = [];
		for (const [id, entry] of Object.entries(this.pending)) {
			if (entry.serverName === serverName) {
				entry.reject(new Error('Cancelled'));
				delete this.pending[id];
				cancelled.push(id);
			}
		}
		return cancelled;
	}

	has(id: string): boolean {
		return id in this.pending;
	}
}
