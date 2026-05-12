import { useEffect, useRef } from 'react';

interface IVoiceWaveformProps {
	stream: MediaStream | null;
	width?: number;
	height?: number;
	barColor?: string;
	barWidth?: number;
	gap?: number;
}

export function VoiceWaveform({
	stream,
	width = 200,
	height = 36,
	barColor = '#10b981',
	barWidth = 2,
	gap = 1,
}: IVoiceWaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);

	useEffect(() => {
		if (!stream) return;
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		ctx.scale(dpr, dpr);

		const audioCtx = new AudioContext();
		audioCtxRef.current = audioCtx;
		const source = audioCtx.createMediaStreamSource(stream);
		const analyser = audioCtx.createAnalyser();
		analyser.fftSize = 256;
		source.connect(analyser);

		const totalBarWidth = barWidth + gap;
		const barCount = Math.floor(width / totalBarWidth);

		// pick fftSize so we have at least 2x bars worth of bins, power of 2, capped
		const desiredBins = Math.max(128, barCount * 2);
		const fftSize = Math.min(2048, 1 << Math.ceil(Math.log2(desiredBins * 2)));
		analyser.fftSize = fftSize;

		source.connect(analyser);

		const bufferLength = analyser.frequencyBinCount;
		const data = new Uint8Array(bufferLength);

		// skip lowest bins (DC + rumble) — start a few bins in
		// and cap upper range to where voice energy actually lives
		const binStart = 2;
		const binEnd = Math.floor(bufferLength * 0.6);
		const usableBins = binEnd - binStart;

		const halfBarCount = Math.floor(barCount / 2);
		const centerX = width / 2;

		const draw = () => {
			analyser.getByteFrequencyData(data);
			ctx.clearRect(0, 0, width, height);
			ctx.fillStyle = barColor;

			for (let i = 0; i < halfBarCount; i++) {
				const binIndex = binStart + Math.floor((i / halfBarCount) * usableBins);
				const v = data[binIndex] / 255;
				const barHeight = Math.max(2, v * height);
				const y = (height - barHeight) / 2;

				const xRight = centerX + i * totalBarWidth;
				const xLeft = centerX - (i + 1) * totalBarWidth;

				ctx.fillRect(xRight, y, barWidth, barHeight);
				ctx.fillRect(xLeft, y, barWidth, barHeight);
			}

			rafRef.current = requestAnimationFrame(draw);
		};
		draw();

		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			source.disconnect();
			audioCtx.close();
		};
	}, [stream, width, height, barColor, barWidth, gap]);

	if (!stream) return null;

	return <canvas ref={canvasRef} style={{ width, height }} />;
}
