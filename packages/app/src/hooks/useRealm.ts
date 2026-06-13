import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import { EventNode, RemoteNode, WSTransport } from '@warpcore/realmcore';
import { AppletManager, EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { feApplets, AppletHostFE } from '@/applets';

export function useRealm(currentThreadId: string | null) {
	const realmRef = useRef<{ 
		eventNode: EventNode; 
		remoteNode: RemoteNode;
		nodeId: string; 
		socket: Socket;
		appletMgr: AppletManager;
	}>(null);

	if (!realmRef.current) {
		console.log(`[Realm] Loading..`);

		const nodeId = `chat-${nanoid(6)}`;
		const chatNode = new EventNode(nodeId, false);
		(window as any).eventNode = chatNode;

		const appletMgr = new AppletManager(
			chatNode,
			EAppletScope.THREAD,
			currentThreadId ?? undefined,
			{ [EAppletHostType.FE]: AppletHostFE },
			feApplets,
			{ testFe: true },
		);

		const socket = io({
			path: '/api/realm/',
			query: { nodeId },
			transports: ['websocket'],
			upgrade: false,
		});
		
		const remoteNode = new RemoteNode('warpcore', chatNode, new WSTransport(socket));

		socket.on('connect', () => {
			console.log(`[Realm] ✅ Connected as ${nodeId}.`);
			appletMgr.initializeAll();
		});
		socket.on('disconnect', () => {
			console.error(`[Realm] Disconnected!`);
		});
		socket.io.on('error', (err) => {
			console.error(`[Realm] Manager error:`, err.message);
		});

		realmRef.current = { 
			eventNode: chatNode, 
			remoteNode,
			nodeId, 
			socket,
			appletMgr,
		};
	}

	useEffect(() => {
		realmRef.current?.appletMgr.updateScopeValue(currentThreadId ?? undefined);
		return () => {
			realmRef.current?.appletMgr.terminateAll();
		};
	}, [currentThreadId]);

	useEffect(() => {
		const socket = realmRef.current?.socket;
		if (socket && !socket.connected) socket.connect();

		return () => {
			socket?.disconnect();
		};
	}, []);

	return realmRef.current;
}
