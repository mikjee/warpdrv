import type { IMessageTransport, TRemoteHandler } from "../RemoteNode";

// in-process transport: two instances linked, sendMessage hands straight to the
// peer's installed handler. no serialization, no network. a websocket transport
// will satisfy IMessageTransport with the same shape, adding request/response
// correlation over the socket internally.
export class MockTransport implements IMessageTransport {
	private handlers: Record<string, TRemoteHandler>;
	private peer: MockTransport | null;

	constructor() {
		this.handlers = {};
		this.peer = null;
	}

	public link(peer: MockTransport): void {
		this.peer = peer;
	}

	public async sendMessage(msgId: string, payload: unknown): Promise<unknown> {
		if (!this.peer) throw new Error("mock transport not linked");
		return this.peer.receive(msgId, payload);
	}

	public onMessage(msgId: string, handler: TRemoteHandler): void {
		this.handlers[msgId] = handler;
	}

	private async receive(msgId: string, payload: unknown): Promise<unknown> {
		const handler = this.handlers[msgId];
		if (!handler) throw new Error("no handler for message: " + msgId);
		return handler(payload);
	}
}
