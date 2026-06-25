import { Volume2 } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { TileContainer } from '../TileContainer';
import { TileValueDisplay } from '../TileValueDisplay';

export const KokoroTile = React.memo(() => {
	const navigate = useNavigate();
	const kokoroStatus = useStore((s) => s.kokoroStatus);
	const isInstalled = kokoroStatus?.installed === true;
	const voiceCount = kokoroStatus?.voicePaths.length ?? 0;

	return (
		<TileContainer
			icon={<Volume2 size={18} />}
			label="Kokoro TTS"
			statusDot={isInstalled ? 'online' : 'offline'}
			onClick={() => navigate('/settings')}
		>
			<TileValueDisplay
				label="Voices Available"
				value={isInstalled ? voiceCount : '—'}
			/>
		</TileContainer>
	);
});
