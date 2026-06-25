import { IExternalNode, IEvent, IRouteState, TNodeId, TAddr } from "./EventNode";

// the transport seam. a transport carries a message to its peer and resolves
// with the peer handler's response. request/response correlation (matching a
// reply to its request) lives inside each transport, not here, so RemoteNode and
// the event framework stay transport-agnostic. a mock links two in-process; a
// websocket transport satisfies the same shape.
export interface IRemoteMessage {
	msgId: string;
	payload: unknown;
}

export type TRemoteHandler = (payload: unknown) => Promise<unknown> | unknown;

export interface IMessageTransport {
	sendMessage(msgId: string, payload: unknown): Promise<unknown>;
	onMessage(msgId: string, handler: TRemoteHandler): void;
}

// message ids carried over a transport.
export enum ERemoteNodeMsg {
	ROUTE = "remote.node.route",
	ADD_PARENT = "remote.node.addParent",
	REMOVE_PARENT = "remote.node.removeParent",
}

interface IRoutePayload {
	ev: IEvent;
	rs?: IRouteState;
}

interface IAddParentPayload {
	parentAddr: TAddr;
}

// a RemoteNode is a stand-in placed in the local tree for a node that actually
// lives across a connection. it wraps the local node it fronts and a transport.
// outbound: IExternalNode calls are sent over the transport. inbound: messages
// from the peer are applied to the wrapped local node. addParent cannot send a
// live parent object across the wire, so it sends the parent address; the far
// side re-injects this RemoteNode as the parent, whose nodeAddr carries that
// address, so the far node derives its own address normally.
export class RemoteNode implements IExternalNode {
	public readonly nodeId: TNodeId;
	public nodeAddr: TAddr;
	private transport: IMessageTransport;
	private local: IExternalNode;

	constructor(nodeId: TNodeId, local: IExternalNode, transport: IMessageTransport) {
		this.nodeId = nodeId;
		this.nodeAddr = "";
		this.local = local;
		this.transport = transport;
		this.setupListeners();
	}

	// outbound IExternalNode surface: forward to the peer over the transport.

	public async addParent(parent: IExternalNode): Promise<void> {
		this.nodeAddr = parent.nodeAddr + "/" + this.nodeId;
		await this.transport.sendMessage(ERemoteNodeMsg.ADD_PARENT, { parentAddr: parent.nodeAddr });
	}

	public async removeParent(): Promise<void> {
		this.nodeAddr = "";
		await this.transport.sendMessage(ERemoteNodeMsg.REMOVE_PARENT, {});
	}

	public async route(ev: IEvent, rs?: IRouteState): Promise<unknown> {
		return this.transport.sendMessage(ERemoteNodeMsg.ROUTE, { ev, rs });
	}

	// inbound: apply peer messages to the wrapped local node. for addParent the
	// far parent is not transferable, so this RemoteNode stands in as the parent;
	// its nodeAddr is set to the address the peer sent, so the local node's own
	// addParent derives the correct address from it.

	private setupListeners(): void {
		this.transport.onMessage(ERemoteNodeMsg.ROUTE, (payload) => {
			const p = payload as IRoutePayload;
			return this.local.route(p.ev, p.rs);
		});
		this.transport.onMessage(ERemoteNodeMsg.ADD_PARENT, (payload) => {
			const p = payload as IAddParentPayload;
			this.nodeAddr = p.parentAddr;
			return this.local.addParent(this);
		});
		this.transport.onMessage(ERemoteNodeMsg.REMOVE_PARENT, () => {
			return this.local.removeParent();
		});
	}
}