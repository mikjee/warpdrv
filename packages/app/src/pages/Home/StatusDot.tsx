import { Box } from '@chakra-ui/react';
import React from 'react';

const dotColors: Record<string, { bg: string; shadow: string }> = {
	online: { bg: '#22c55e', shadow: '0 0 6px rgba(34, 197, 94, 0.5)' },
	loading: { bg: '#f59e0b', shadow: '0 0 6px rgba(245, 158, 11, 0.5)' },
	error: { bg: '#ef4444', shadow: '0 0 6px rgba(239, 68, 68, 0.6)' },
	offline: { bg: 'rgba(255,255,255,0.15)', shadow: 'none' },
};

export const StatusDot = React.memo(({ state }: { state: 'online' | 'loading' | 'error' | 'offline' }) => {
	const { bg, shadow } = dotColors[state];
	return (
		<Box
			w="8px"
			h="8px"
			borderRadius="full"
			bg={bg}
			boxShadow={shadow}
			flexShrink={0}
			animation={state === 'loading' ? 'pulse 1.5s ease infinite' : undefined}
		/>
	);
});
