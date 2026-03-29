import { useEffect } from 'react';
import { useStore } from '@/store';

export function useEventSource() {
	useEffect(() => {
		const eventSource = new EventSource('/api/events');

		eventSource.onopen = () => {
			useStore.getState().setSseConnected(true);
			console.log('[SSE] Connected');
		};

		eventSource.onmessage = (event) => {
			const { channel, data } = JSON.parse(event.data);
			console.log(`[${channel}]`, data);

			const handler = useStore.getState().SSEHandlers[channel];
			if (handler) handler(data);
		};

		eventSource.onerror = (error) => {
			console.error('[SSE] Error:', error);
			useStore.getState().setSseConnected(false);
			eventSource.close();
			// Auto-reconnect after 5 seconds
			setTimeout(() => {
				window.location.reload();
			}, 5000);
		};

		return () => {
			eventSource.close();
		};
	}, []);
}
