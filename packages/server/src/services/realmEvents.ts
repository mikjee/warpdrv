import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { EventNode, RemoteNode, WSTransport } from '@warpcore/realmcore';

let mainNode: EventNode | null = null;
let io: IOServer | null = null;

export function initRealmEvents(server: HTTPServer): { node: EventNode; io: IOServer } {
	mainNode = new EventNode('main', true);
	io = new IOServer(server, { path: '/api/realm/' });

	io.on('connection', (socket) => {
		const nodeId = socket.handshake.query.nodeId as string;
		console.log(`[RealmEvents] Connection from ${nodeId}`);
		const transport = new WSTransport(socket);
		const remoteNode = new RemoteNode(nodeId, mainNode!, transport);
		mainNode!.addChild(remoteNode).then(() => {
			console.log(`[RealmEvents] ${nodeId} added as child`);
		}).catch(err => {
			console.error(`[RealmEvents] Failed to add ${nodeId} as child:`, err);
		});

		socket.on('disconnect', () => {
			console.log(`[RealmEvents] ${nodeId} disconnected`);
			mainNode!.removeChild(nodeId);
		});

		socket.on('error', (err) => {
			console.error(`[RealmEvents] ${nodeId} error:`, err);
		});
	});

	return { node: mainNode, io };
}

export function getMainNode(): EventNode {
	return mainNode!;
}
