import { Blocks } from 'lucide-react';
import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

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
			<TileValueDisplay label="llama.cpp Builds" value={backendsCount} />
		</TileContainer>
	);
});
