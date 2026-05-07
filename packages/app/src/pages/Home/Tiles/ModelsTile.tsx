import { FolderOpen } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const ModelsTile = React.memo(() => {
	const navigate = useNavigate();
	const models = useStore((s) => s.models);

	return (
		<TileContainer
			icon={<FolderOpen size={18} />}
			label="Models"
			onClick={() => navigate('/models')}
		>
			<TileValueDisplay label="LLMs" value={Object.values(models).length} />
		</TileContainer>
	);
});
