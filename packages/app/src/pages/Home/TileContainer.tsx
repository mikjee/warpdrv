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
		<Box flex="0 1 280px" aspectRatio="4/3" overflowY="auto">
			<Box
				h="full"
				w="full"
				position="relative"
				bg="#161616"
				borderRadius="xl"
				borderWidth="1px"
				borderColor="rgba(255, 255, 255, 0.06)"
				p="6"
				display="flex"
				flexDir="column"
				overflow="hidden"
				cursor={isClickable ? 'pointer' : 'default'}
				transition="all 0.2s ease"
				_hover={isClickable ? {
					borderColor: 'rgba(255, 255, 255, 0.12)',
					bg: 'rgba(255,255,255,0.035)',
					transform: 'translateY(-1px)',
				} : undefined}
				onClick={onClick}
			>
				<VStack align="stretch" gap="4" flex="1">
					<Flex align="center" justify="space-between">
						<HStack gap="2">
							<Box color="rgba(255,255,255,0.4)">{icon}</Box>
							<Text fontSize="12px" fontWeight="600" color="rgba(255,255,255,0.5)" textTransform="uppercase" letterSpacing="0.05em">
								{label}
							</Text>
						</HStack>
						{statusDot && <StatusDot state={statusDot} />}
					</Flex>
					{children}
				</VStack>
			</Box>
		</Box>
	);
});
