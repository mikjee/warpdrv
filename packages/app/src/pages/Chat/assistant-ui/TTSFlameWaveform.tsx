import { useEffect, useRef, useState } from 'react';
import { subscribeTTSAnalyser } from './KokoroTTS';
interface ITTSFlameWaveformProps {
	height?: number;
}
export function TTSFlameWaveform({ height = 64 }: ITTSFlameWaveformProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const rafRef = useRef<number | null>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
	useEffect(() => {
		return subscribeTTSAnalyser(setAnalyser);
	}, []);
	useEffect(() => {
		if (!analyser) return;
		const canvas = canvasRef.current;
		const wrap = wrapRef.current;
		if (!canvas || !wrap) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		let width = wrap.clientWidth;
		const resize = () => {
			width = wrap.clientWidth;
			canvas.width = width * dpr;
			canvas.height = height * dpr;
			canvas.style.width = `${width}px`;
			canvas.style.height = `${height}px`;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.scale(dpr, dpr);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		const bufferLength = analyser.frequencyBinCount;
		const data = new Uint8Array(bufferLength);
		const samples = 64;
		const binStart = 2;
		const binEnd = Math.floor(bufferLength * 0.6);
		const usableBins = binEnd - binStart;
		const draw = () => {
			analyser.getByteFrequencyData(data);
			ctx.clearRect(0, 0, width, height);
			const pts: Array<{ x: number; y: number }> = [];
			const cx = samples / 2;
			for (let i = 0; i <= samples; i++) {
				const binIndex = binStart + Math.floor((i / samples) * usableBins);
				const v = data[binIndex] / 255;
				const envelope = 1 - Math.pow(Math.abs(i - cx) / cx, 1.6);
				const amp = v * envelope;
				const y = Math.max(2, amp * height * 0.95);
				const x = (i / samples) * width;
				pts.push({ x, y });
			}
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(pts[0].x, pts[0].y);
			for (let i = 0; i < pts.length - 1; i++) {
				const p0 = pts[i];
				const p1 = pts[i + 1];
				const mx = (p0.x + p1.x) / 2;
				const my = (p0.y + p1.y) / 2;
				ctx.quadraticCurveTo(p0.x, p0.y, mx, my);
			}
			ctx.lineTo(width, 0);
			ctx.closePath();
			const grad = ctx.createLinearGradient(0, 0, 0, height);
			grad.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
			grad.addColorStop(0.25, 'rgba(255, 180, 60, 0.75)');
			grad.addColorStop(0.6, 'rgba(255, 90, 30, 0.45)');
			grad.addColorStop(1, 'rgba(180, 20, 10, 0)');
			ctx.fillStyle = grad;
			ctx.fill();
			rafRef.current = requestAnimationFrame(draw);
		};
		draw();
		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			ro.disconnect();
		};
	}, [analyser, height]);
	return (
		<div
			ref={wrapRef}
			style={{
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				height,
				pointerEvents: 'none',
				zIndex: 0,
				overflow: 'hidden',
				borderTopLeftRadius: 'var(--composer-radius, 24px)',
				borderTopRightRadius: 'var(--composer-radius, 24px)',
			}}
		>
			<canvas ref={canvasRef} />
		</div>
	);
}
