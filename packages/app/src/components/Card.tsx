import { Box } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface ICardProps {
	children: ReactNode;
	variant?: 'default' | 'accent' | 'status';
	accentColor?: string;
	bg?: string;
	borderColor?: string;
	onClick?: () => void;
	selected?: boolean;
	hasGradient?: boolean;
	gradientFrom?: string;
	gradientTo?: string;
	p?: string;
}

export function Card({ children, variant = 'default', accentColor, onClick, selected, bg, borderColor, hasGradient, gradientFrom, gradientTo, p = '5' }: ICardProps) {
	const isClickable = !!onClick;

	return (
		<Box
			position="relative"
			bg={hasGradient && gradientFrom && gradientTo ? undefined : bg ?? '#161616'}
			bgGradient={hasGradient && gradientFrom && gradientTo ? 'to-br' : undefined}
			gradientFrom={hasGradient ? gradientFrom : undefined}
			gradientTo={hasGradient ? gradientTo : undefined}
			borderRadius="xl"
			borderWidth="1px"
			borderColor={selected ? 'rgba(51, 129, 255, 0.4)' : borderColor ?? 'rgba(255, 255, 255, 0.06)'}
			p={p}
			cursor={isClickable ? 'pointer' : 'default'}
			transition="all 0.2s ease"
			overflow="hidden"
			onClick={onClick}
			_hover={isClickable ? {
				borderColor: selected ? 'rgba(51, 129, 255, 0.5)' : 'rgba(255, 255, 255, 0.12)',
				bg: '#131317',
				transform: 'translateY(-1px)',
				shadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
			} : undefined}
			_before={variant === 'accent' && accentColor ? {
				content: '""',
				position: 'absolute',
				top: 0,
				left: 0,
				right: 0,
				height: '2px',
				bg: accentColor,
				borderTopRadius: 'xl',
			} : undefined}
		>
			{children}
		</Box>
	);
}
