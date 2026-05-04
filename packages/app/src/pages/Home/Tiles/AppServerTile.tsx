import { Text } from '@chakra-ui/react';
import { Server } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';

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
			<span style={{ color: "#777", fontSize: "12px" }}>Remote Port</span>
			<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.85)">
				{settings.apiPort}
			</Text>
		</TileContainer>
	);
});
