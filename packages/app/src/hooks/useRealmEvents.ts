import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { nanoid } from 'nanoid';
import { EventNode, RemoteNode, WSTransport } from '@warpcore/realmcore';

export function useRealmEvents() {
	const ref = useRef<{ node: EventNode; nodeId: string; socket: Socket }>();

	if (!ref.current) {
		const nodeId = `web-${nanoid()}`;
		console.log(`[useRealmEvents] Creating node ${nodeId}`);
		const node = new EventNode(nodeId, false);
		const socket = io({
			query: { nodeId },
			path: '/api/realm/',
		});
		new RemoteNode('main', node, new WSTransport(socket));
		socket.on('connect', () => {
			console.log(`[useRealmEvents] Connected as ${nodeId}`);
		});
		socket.on('disconnect', () => {
			console.log(`[useRealmEvents] Disconnected`);
		});
		socket.on('connect_error', (err) => {
			console.error(`[useRealmEvents] Connect error:`, err.message);
		});
		socket.io.on('error', (err) => {
			console.error(`[useRealmEvents] Manager error:`, err.message);
		});
		socket.io.on('reconnect_failed', () => {
			console.error(`[useRealmEvents] Reconnect failed`);
		});
		ref.current = { node, nodeId, socket };
	}

	useEffect(() => {
		return () => {
			ref.current?.socket.disconnect();
		};
	}, []);

	return ref.current;
}
