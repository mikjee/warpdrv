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
				bg="var(--w-home-tiles-container-bg)"
				borderRadius="xl"
				borderWidth="1px"
				borderColor={statusDot === 'error' ? 'var(--w-home-tiles-container-border-error)' : 'var(--w-home-tiles-container-border)'}
				p="6"
				display="flex"
				flexDir="column"
				overflow="hidden"
				cursor={isClickable ? 'pointer' : 'default'}
				transition="all 0.2s ease"
				_hover={isClickable ? {
					borderColor: 'var(--w-home-tiles-container-hover-border)',
					bg: 'var(--w-home-tiles-container-hover-bg)',
					transform: 'translateY(-1px)',
				} : undefined}
				onClick={onClick}
			>
			<Flex align="center" justify="space-between">
				<HStack gap="2">
					<Box color="var(--w-home-tiles-container-icon)">{icon}</Box>
					<Text fontSize="12px" fontWeight="600" color="var(--w-home-tiles-container-label)" textTransform="uppercase" letterSpacing="0.05em">
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
