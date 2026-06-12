import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { EventNode, RemoteNode, WSTransport } from '@warpcore/realmcore';

let mainNode: EventNode | null = null;
let io: IOServer | null = null;

export function initRealm(server: HTTPServer): { node: EventNode; io: IOServer } {
	mainNode = new EventNode('main', true);
	server.on('upgrade', (req) => {
        console.log('[RealmEvents] upgrade headers:', req.headers.connection, req.headers.upgrade);
    });
	io = new IOServer(server, { 
		path: '/api/realm/',
		cors: { origin: true, credentials: true },
	});

	io.engine.on('connection', (rawSocket) => {
        console.log('[Realm] engine connection:', rawSocket.id);
        rawSocket.on('data', (data: unknown) => {
            console.log('[Realm] engine raw data:', JSON.stringify(data));
        });
        rawSocket.on('packet', (p: unknown) => {
            console.log('[Realm] engine packet:', JSON.stringify(p));
        });
        rawSocket.on('close', (reason: unknown) => {
            console.log('[Realm] engine close:', JSON.stringify(reason));
        });
    });
    io.of('/').on('connect', (socket) => {
        console.log('[Realm] namespace connect:', socket.id);
    });

	io.on('connection', (socket) => {
		const nodeId = socket.handshake.query.nodeId as string;
		console.log(`[Realm] Connection from ${nodeId}`);

		const transport = new WSTransport(socket);
		const remoteNode = new RemoteNode(nodeId, mainNode!, transport);
		
		mainNode!.addChild(remoteNode).then(() => {
			console.log(`[Realm] ${nodeId} added as child`);
		}).catch(err => {
			console.error(`[Realm] Failed to add ${nodeId} as child:`, err);
		});

		socket.on('disconnect', () => {
			console.log(`[Realm] ${nodeId} disconnected`);
			mainNode!.removeChild(nodeId);
		});

		socket.on('error', (err) => {
			console.error(`[Realm] ${nodeId} error:`, err);
		});
	});

	return { node: mainNode, io };
}

export function getMainNode(): EventNode {
	return mainNode!;
}
