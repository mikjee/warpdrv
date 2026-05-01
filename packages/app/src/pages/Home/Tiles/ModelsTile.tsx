import { Text } from '@chakra-ui/react';
import { FolderOpen } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';

export const ModelsTile = React.memo(() => {
	const navigate = useNavigate();
	const models = useStore((s) => s.models);

	return (
		<TileContainer
			icon={<FolderOpen size={18} />}
			label="Models"
			onClick={() => navigate('/models')}
		>
			<span style={{ color: "#777", fontSize: "12px" }}>LLMs</span>
			<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.85)">
				{Object.values(models).length}
			</Text>
		</TileContainer>
	);
});
