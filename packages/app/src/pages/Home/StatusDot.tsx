import { Box } from '@chakra-ui/react';
import React from 'react';

const dotColors: Record<string, { bg: string; shadow: string }> = {
	online: { bg: 'var(--wc-accent-green-icon)', shadow: '0 0 6px var(--w-home-statusdot-online-shadow)' },
		loading: { bg: 'var(--wc-accent-yellow-strong)', shadow: '0 0 6px var(--w-home-statusdot-loading-shadow)' },
		error: { bg: 'var(--wc-accent-red-alt)', shadow: '0 0 6px var(--w-home-statusdot-error-shadow)' },
		offline: { bg: 'var(--wc-text-disabled)', shadow: 'none' },
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
