import { Text } from '@chakra-ui/react';
import { BsRouter } from 'react-icons/bs';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';

export const ProxyTile = React.memo(() => {
	const navigate = useNavigate();
	const proxyStatus = useStore((s) => s.proxyStatus);
	const settings = useStore((s) => s.settings);

	const state: 'online' | 'loading' | 'error' | 'offline' =
		proxyStatus?.error != null ? 'error' : proxyStatus?.running ? 'online' : 'offline';

	return (
		<TileContainer
			icon={<BsRouter size={18} />}
			label="Proxy"
			statusDot={state}
			onClick={() => navigate('/proxy')}
		>
			<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.85)">
				{proxyStatus?.port ?? settings.proxyPort}
			</Text>
		</TileContainer>
	);
});
