import { useRef } from 'react';
import { AudioWave, useMediaStreamSource } from '@audiowave/react';
import type { AudioWaveController } from '@audiowave/react';

interface IVoiceWaveformProps {
	mediaStream: MediaStream | null;
}

export function VoiceWaveform({ mediaStream }: IVoiceWaveformProps) {
	const { source } = useMediaStreamSource(mediaStream);
	const ref = useRef<AudioWaveController>(null);

	return (
		<AudioWave
			ref={ref}
			source={source}
			height={32}
			barWidth={2}
			gap={1}
			color="var(--wc-accent-green)"
			amplitudeMode="rms"
			className="w-full rounded-md"
		/>
	);
}
