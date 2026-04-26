import { Box, Text, HStack } from '@chakra-ui/react';

interface IOnboardingHeaderProps {
	title: string;
	step: number;
	totalSteps: number;
}

export function OnboardingHeader({ title, step, totalSteps }: IOnboardingHeaderProps) {
	return (
		<Box textAlign="center" pb="6">
			<Text fontSize="24px" fontWeight="600" color="#e4e4e7" letterSpacing="-0.02em">
				{title}
			</Text>
			<HStack gap="2" justifyContent="center" mt="4">
				{Array.from({ length: totalSteps }).map((_, i) => {
					const isCompleted = i < step;
					const isCurrent = i === step;
					return (
						<Box
							key={i}
							w={isCurrent ? '24px' : '8px'}
							h="8px"
							borderRadius="full"
							transition="all 0.2s ease"
							bg={isCompleted ? '#3381ff' : isCurrent ? '#3381ff' : 'rgba(255, 255, 255, 0.15)'}
						/>
					);
				})}
			</HStack>
		</Box>
	);
}
