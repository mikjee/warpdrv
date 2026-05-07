import { Server } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const AppServerTile = React.memo(() => {
	const navigate = useNavigate();
	const settings = useStore((s) => s.settings);
	const sseConnected = useStore((s) => s.sseConnected);

	return (
		<TileContainer
			icon={<Server size={18} />}
			label="App Server"
			statusDot={sseConnected ? 'online' : 'error'}
			onClick={() => navigate('/settings')}
		>
			<TileValueDisplay label="Remote Port" value={settings.apiPort} />
		</TileContainer>
	);
});
