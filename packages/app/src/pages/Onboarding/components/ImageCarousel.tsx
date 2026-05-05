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
			border: '1px solid var(--wc-border-subtle)',
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
					color: 'var(--wc-text-heading)',
					marginBottom: '4px',
				}}>
					{slide.title}
				</div>
				<div style={{
					fontSize: '14px',
					color: 'var(--wc-text-muted)',
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
						color: 'var(--wc-text-disabled)',
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
						color: 'var(--wc-text-secondary)',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						padding: '4px',
					}}
					onMouseEnter={(e) => e.currentTarget.style.color = 'var(--wc-text-primary)'}
					onMouseLeave={(e) => e.currentTarget.style.color = 'var(--wc-text-secondary)'}
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
								background: i === index ? 'var(--wc-text-primary)' : 'var(--wc-text-faint)',
							}}
						/>
					))}
				</div>

				<button
					onClick={next}
					style={{
						background: 'transparent',
						border: 'none',
						color: 'var(--wc-text-secondary)',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						padding: '4px',
					}}
					onMouseEnter={(e) => e.currentTarget.style.color = 'var(--wc-text-primary)'}
					onMouseLeave={(e) => e.currentTarget.style.color = 'var(--wc-text-secondary)'}
				>
					<ChevronRight size={16} />
				</button>
			</div>
		</div>
	);
}