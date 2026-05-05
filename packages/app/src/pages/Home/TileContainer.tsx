import { Box, Text, HStack, VStack, Flex } from '@chakra-ui/react';
import React from 'react';
import { StatusDot } from './StatusDot';

export const TileContainer = React.memo(({
	icon,
	label,
	statusDot,
	children,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	statusDot?: 'online' | 'loading' | 'error' | 'offline';
	children: React.ReactNode;
	onClick?: () => void;
}) => {
	const isClickable = !!onClick;

	return (
		<Box minW="250px" maxW="400px" h="200px" overflowY="auto">
			<Box
				h="full"
				w="full"
				position="relative"
				bg="var(--wc-bg-surface)"
				borderRadius="xl"
				borderWidth="1px"
				borderColor={statusDot === 'error' ? 'var(--wc-accent-red-alt-bg)' : 'var(--wc-border-subtle)'}
				p="6"
				display="flex"
				flexDir="column"
				overflow="hidden"
				cursor={isClickable ? 'pointer' : 'default'}
				transition="all 0.2s ease"
				_hover={isClickable ? {
					borderColor: 'var(--wc-border-hover)',
					bg: 'var(--wc-bg-hover)',
					transform: 'translateY(-1px)',
				} : undefined}
				onClick={onClick}
			>
			<Flex align="center" justify="space-between">
				<HStack gap="2">
					<Box color="var(--wc-text-muted)">{icon}</Box>
					<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">
						{label}
					</Text>
				</HStack>
				{statusDot && <StatusDot state={statusDot} />}
			</Flex>
			<Box flex="1" display="flex" flexDir="column" justifyContent="flex-end" alignItems={"end"}>
				{children}
			</Box>
			</Box>
		</Box>
	);
});
