import { useState } from 'react';
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react';

interface ICarouselSlide {
	image?: string;
	title: string;
	description: string;
}

interface IImageCarouselProps {
	slides: ICarouselSlide[];
}

export function ImageCarousel({ slides }: IImageCarouselProps) {
	const [index, setIndex] = useState(0);
	const slide = slides[index]!;

	const prev = () => setIndex((i) => (i === 0 ? slides.length - 1 : i - 1));
	const next = () => setIndex((i) => (i === slides.length - 1 ? 0 : i + 1));

	return (
		<div style={{
			height: 'calc(100% - 50px)',
			width: '100%',
			display: 'flex',
			flexDirection: 'column',
			overflow: 'hidden',
			border: '1px solid rgba(255, 255, 255, 0.06)',
			borderRadius: '8px',
			background: 'transparent',
			boxSizing: 'border-box',
		}}>
			<div style={{
				flexShrink: 0,
				padding: '12px 16px',
				textAlign: 'center',
			}}>
				<div style={{
					fontSize: '16px',
					fontWeight: 600,
					color: '#e4e4e7',
					marginBottom: '4px',
				}}>
					{slide.title}
				</div>
				<div style={{
					fontSize: '14px',
					color: 'rgba(255, 255, 255, 0.45)',
					lineHeight: 1.5,
				}}>
					{slide.description}
				</div>
			</div>

			<div style={{
				flex: 1,
				minHeight: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				overflow: 'hidden',
			}}>
				{slide.image ? (
					<img
						src={slide.image}
						alt={slide.title}
						style={{
							maxWidth: '100%',
							maxHeight: '100%',
							width: 'auto',
							height: 'auto',
							objectFit: 'contain',
							display: 'block',
						}}
						loading="lazy"
					/>
				) : (
					<div style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: '8px',
						color: 'rgba(255, 255, 255, 0.15)',
					}}>
						<ImageIcon size={32} />
						<div style={{ fontSize: '12px' }}>Screenshot placeholder</div>
					</div>
				)}
			</div>

			<div style={{
				flexShrink: 0,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: '16px',
				padding: '8px',
			}}>
				<button
					onClick={prev}
					style={{
						background: 'transparent',
						border: 'none',
						color: 'rgba(255, 255, 255, 0.4)',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						padding: '4px',
					}}
					onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'}
					onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
				>
					<ChevronLeft size={16} />
				</button>

				<div style={{ display: 'flex', gap: '6px' }}>
					{slides.map((_, i) => (
						<button
							key={i}
							onClick={() => setIndex(i)}
							style={{
								width: '6px',
								height: '6px',
								borderRadius: '50%',
								border: 'none',
								padding: 0,
								cursor: 'pointer',
								background: i === index ? 'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.2)',
							}}
						/>
					))}
				</div>

				<button
					onClick={next}
					style={{
						background: 'transparent',
						border: 'none',
						color: 'rgba(255, 255, 255, 0.4)',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						padding: '4px',
					}}
					onMouseEnter={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)'}
					onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)'}
				>
					<ChevronRight size={16} />
				</button>
			</div>
		</div>
	);
}