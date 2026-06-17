import { Server as IOServer } from 'socket.io';
import { Server as HTTPServer } from 'node:http';
import { EventNode, RemoteNode, WSTransport, AppletManager, EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { beApplets, AppletHostBE } from '../applets';

let warpcoreNode: EventNode | null = null;
let io: IOServer | null = null;
let appletManager: AppletManager | null = null;

export async function initRealm(server: HTTPServer, node: EventNode): Promise<{ node: EventNode; io: IOServer; appletManager: AppletManager }> {
	warpcoreNode = node;

	io = new IOServer(server, { 
		path: '/api/realm/',
		cors: { origin: true, credentials: true },
	});

	io.on('connection', (socket) => {
		const nodeId = socket.handshake.query.nodeId as string;
		console.log(`[Realm] Connection from ${nodeId}`);

		const transport = new WSTransport(socket);
		const remoteNode = new RemoteNode(nodeId, warpcoreNode!, transport);
		
		warpcoreNode!.addChild(remoteNode).then(() => {
			console.log(`[Realm] ${nodeId} added as child`);
		}).catch(err => {
			console.error(`[Realm] Failed to add ${nodeId} as child:`, err);
		});

		socket.on('disconnect', () => {
			console.log(`[Realm] ${nodeId} disconnected`);
			warpcoreNode!.removeChild(nodeId);
		});

		socket.on('error', (err) => {
			console.error(`[Realm] ${nodeId} error:`, err);
		});
	});

	appletManager = new AppletManager(
		warpcoreNode,
		EAppletScope.GLOBAL,
		undefined,
		{ [EAppletHostType.BE]: AppletHostBE },
		beApplets,
		{ BEApplet: true },
	);
	await appletManager.initializeAll();
	return { node: warpcoreNode, io, appletManager };
}
