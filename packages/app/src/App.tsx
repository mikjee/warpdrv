import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { fetchSettings, scanModels } from './api/services';
import { useToast } from './components/ToastProvider';
import { useEventSource } from './hooks/useEventSource';
import { useChatEventsStream } from './hooks/useChatEventsStream';

export function App() {
	const { toast } = useToast();
	const startupScanDone = useRef(false);

	// Initialize SSE connection for control plane
	useEventSource();

	// Initialize bridge SSE connection for chat events
	useChatEventsStream();

	// Run one model scan on app startup if model directories are configured
	useEffect(() => {
		if (startupScanDone.current) return;
		startupScanDone.current = true;

		fetchSettings().then(async (settingsResult) => {
			if (settingsResult.ok && settingsResult.data.modelRoots.length > 0) {
				const scanResult = await scanModels();
				if (scanResult.ok) {
					toast('success', `Scanned ${scanResult.data.length} models`);
				}
			}
		});
	}, [toast]);

	return (
		<Routes>
			<Route element={<Shell />}>
				<Route index element={<Navigate to="/servers" replace />} />
				{/* Routes exist for URL matching/navigation; Shell handles rendering via PAGE_REGISTRY */}
				<Route path="/about" />
				<Route path="/devices" />
				<Route path="/models" />
				<Route path="/backends" />
				<Route path="/servers" />
				<Route path="/hub" />
				<Route path="/proxy" />
				<Route path="/chat" />
				<Route path="/settings" />
				<Route path="/mcp" />
			</Route>
		</Routes>
	);
}
