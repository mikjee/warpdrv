import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { DevicesPage } from './pages/DevicesPage';
import { ModelsPage } from './pages/ModelsPage';
import { BackendsPage } from './pages/BackendsPage';
import { ServersPage } from './pages/ServersPage';
import { SettingsPage } from './pages/SettingsPage';
import { HubPage } from './pages/HubPage';

export function App() {
	return (
		<Routes>
			<Route element={<Shell />}>
				<Route index element={<Navigate to="/servers" replace />} />
				<Route path="/devices" element={<DevicesPage />} />
				<Route path="/models" element={<ModelsPage />} />
				<Route path="/backends" element={<BackendsPage />} />
				<Route path="/servers" element={<ServersPage />} />
				<Route path="/hub" element={<HubPage />} />
				<Route path="/settings" element={<SettingsPage />} />
			</Route>
		</Routes>
	);
}
