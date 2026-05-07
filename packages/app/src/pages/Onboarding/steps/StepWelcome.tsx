import { Box, Text, Flex, Image } from '@chakra-ui/react';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

export function StepWelcome({ goNext, goPrev, finishOnboarding }: IStepProps) {
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="Welcome" step={0} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" justifyContent="center" px="4">
				<Box display="flex" flexDirection="column" alignItems="center" textAlign="center" py="12">
					<Flex w="56px" h="56px" borderRadius="xl" overflow="hidden" mb="6" boxShadow="0 0 32px var(--wc-accent-blue-bg-15)">
						<Image src="/logo.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
					</Flex>
					<Text fontSize="28px" fontWeight="700" color="var(--wc-text-heading)" letterSpacing="-0.03em" mb="3">
						Welcome to warpdrv
					</Text>
					<Text fontSize="15px" color="var(--wc-text-muted)" maxW="400px" lineHeight="1.6">
						Let's get you set up in a few quick steps — configure your model folders, learn the basics, and start running models.
					</Text>
				</Box>
			</Box>

			<OnboardingFooter onNext={goNext} disableBack />
		</Box>
	);
}
