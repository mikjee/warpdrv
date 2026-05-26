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
		let phase = 0;
		const drawPass = (pts: Array<{ x: number; y: number }>, hueShift: number, alpha: number, yScale: number) => {
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(pts[0].x, pts[0].y * yScale);
			for (let i = 0; i < pts.length - 1; i++) {
				const p0 = pts[i];
				const p1 = pts[i + 1];
				const mx = (p0.x + p1.x) / 2;
				const my = ((p0.y + p1.y) / 2) * yScale;
				ctx.quadraticCurveTo(p0.x, p0.y * yScale, mx, my);
			}
			ctx.lineTo(width, 0);
			ctx.closePath();
			const grad = ctx.createLinearGradient(0, 0, width, height);
			grad.addColorStop(0,    `hsla(${(190 + hueShift) % 360}, 90%, 65%, ${alpha})`);
			grad.addColorStop(0.33, `hsla(${(270 + hueShift) % 360}, 85%, 65%, ${alpha})`);
			grad.addColorStop(0.66, `hsla(${(320 + hueShift) % 360}, 90%, 65%, ${alpha})`);
			grad.addColorStop(1,    `hsla(${(20  + hueShift) % 360}, 95%, 65%, ${alpha})`);
			ctx.fillStyle = grad;
			ctx.fill();
		};
		const draw = () => {
			analyser.getByteFrequencyData(data);
			ctx.clearRect(0, 0, width, height);
			phase = (phase + 0.4) % 360;
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
			ctx.globalCompositeOperation = 'lighter';
			ctx.filter = 'blur(14px)';
			drawPass(pts, phase, 0.35, 1.15);
			ctx.filter = 'blur(7px)';
			drawPass(pts, phase + 60, 0.30, 1.0);
			ctx.filter = 'blur(2px)';
			drawPass(pts, phase + 120, 0.25, 0.85);
			ctx.filter = 'none';
			ctx.globalCompositeOperation = 'source-over';
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
