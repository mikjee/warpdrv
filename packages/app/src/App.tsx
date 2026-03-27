import { useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { AboutPage } from './pages/AboutPage';
import { DevicesPage } from './pages/DevicesPage';
import { ModelsPage } from './pages/ModelsPage';
import { BackendsPage } from './pages/BackendsPage';
import { ServersPage } from './pages/ServersPage';
import { HubPage } from './pages/HubPage';
import { SettingsPage } from './pages/SettingsPage';
import { ProxyPage } from './pages/ProxyPage';
import { ChatPage } from './pages/ChatPage';
import { fetchSettings, scanModels } from './api/services';
import { useToast } from './components/ToastProvider';

export function App() {
	const { toast } = useToast();
	const startupScanDone = useRef(false);

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
				<Route path="/about" element={<AboutPage />} />
				<Route path="/devices" element={<DevicesPage />} />
				<Route path="/models" element={<ModelsPage />} />
				<Route path="/backends" element={<BackendsPage />} />
				<Route path="/servers" element={<ServersPage />} />
				<Route path="/hub" element={<HubPage />} />
				<Route path="/proxy" element={<ProxyPage />} />
				<Route path="/chat" element={<ChatPage />} />
				<Route path="/settings" element={<SettingsPage />} />
			</Route>
		</Routes>
	);
}
