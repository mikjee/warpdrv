import { Text } from '@chakra-ui/react';
import { Blocks } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';

export const BackendsTile = React.memo(() => {
	const navigate = useNavigate();
	const backends = useStore((s) => s.backends);
	const backendsCount = useMemo(() => Object.keys(backends).length, [backends]);

	return (
		<TileContainer
			icon={<Blocks size={18} />}
			label="Backends"
			onClick={() => navigate('/backends')}
		>
			<span style={{ color: "#777", fontSize: "12px" }}>llama.cpp Builds</span>
			<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.85)">
				{backendsCount}
			</Text>
		</TileContainer>
	);
});
