import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useToast } from './components/ToastProvider';
import { useEventSource } from './hooks/useEventSource';
import { useChatEventsStream } from './hooks/useChatEventsStream';
import { useStore } from './store';
import { fetchKokoroStatus, updateSettings } from './api/services';
import { ETheme } from '@warpcore/shared';
export function App() {
	const { toast } = useToast();
	const theme = useStore(s => s.settings.theme ?? ETheme.DARK);

	// Initialize SSE connection for control plane
	useEventSource();

	// Initialize bridge SSE connection for chat events
	useChatEventsStream();

	// Apply theme to html element
	useEffect(() => {
		document.documentElement.className = `theme-${theme}`;
	}, [theme]);

	// Apply app zoom level
	const zoomLevel = useStore(s => s.settings.appZoomLevel ?? 1.0);
	useEffect(() => {
		const root = document.getElementById('root');
		if (root) root.style.zoom = String(zoomLevel);
	}, [zoomLevel]);

	// Ctrl/Cmd + wheel zoom
	useEffect(() => {
		const handler = (e: WheelEvent) => {
			if (!e.ctrlKey && !e.metaKey) return;
			e.preventDefault();
			const state = useStore.getState();
			const current = state.settings.appZoomLevel ?? 1.0;
			const delta = e.deltaY > 0 ? -0.1 : 0.1;
			const next = Math.min(3, Math.max(0.5, current + delta));
			updateSettings({ appZoomLevel: next });
		};
		document.addEventListener('wheel', handler, { passive: false });
		return () => document.removeEventListener('wheel', handler);
	}, []);

	// Expose store to window for debugging
	useEffect(() => {
		(window as any).useStore = useStore;
		(window as any).getStoreState = () => useStore.getState();
	}, []);

	// disable rightclick
	useEffect(() => {
		const handler = (e: MouseEvent) => e.preventDefault();
		document.addEventListener('contextmenu', handler);
		return () => document.removeEventListener('contextmenu', handler);
	}, []);

	// Fetch kokoro status on mount
	useEffect(() => { fetchKokoroStatus(); }, []);

	return (
		<Routes>
			<Route element={<Shell />}>
				<Route index element={<Navigate to="/home" replace />} />
				<Route path="/home" />
				<Route path="/about" />
				<Route path="/models" />
				<Route path="/backends" />
				<Route path="/servers" />
				<Route path="/hub" />
				<Route path="/proxy" />
				<Route path="/chat" />
				<Route path="/settings" />
				<Route path="/mcp" />
				<Route path="/recipes" />
				<Route path="/checkpoints" />
			</Route>
		</Routes>
	);
}
