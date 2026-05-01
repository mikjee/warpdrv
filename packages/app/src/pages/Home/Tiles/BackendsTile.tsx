import { Text } from '@chakra-ui/react';
import { Blocks } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';

export const BackendsTile = React.memo(() => {
	const navigate = useNavigate();
	const backends = useStore((s) => s.backends);
	const backendGroups = useStore((s) => s.backendGroups);

	return (
		<TileContainer
			icon={<Blocks size={18} />}
			label="Backends"
			onClick={() => navigate('/backends')}
		>
			<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.85)">
				{Object.values(backends).length} backends, {Object.values(backendGroups).length} groups
			</Text>
		</TileContainer>
	);
});
