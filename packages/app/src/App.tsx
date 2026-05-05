import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useToast } from './components/ToastProvider';
import { useEventSource } from './hooks/useEventSource';
import { useChatEventsStream } from './hooks/useChatEventsStream';
import { useStore } from './store';
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

	return (
		<Routes>
			<Route element={<Shell />}>
				<Route index element={<Navigate to="/home" replace />} />
				{/* Routes exist for URL matching/navigation; Shell handles rendering via PAGE_REGISTRY */}
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
