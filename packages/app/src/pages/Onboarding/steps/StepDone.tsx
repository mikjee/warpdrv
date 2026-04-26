import { Box, Text, Flex } from '@chakra-ui/react';
import { CircleCheck } from 'lucide-react';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

export function StepDone({ goNext, goPrev, finishOnboarding }: IStepProps) {
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="All Done" step={3} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" justifyContent="center" px="4">
				<Box display="flex" flexDirection="column" alignItems="center" textAlign="center" py="12">
					<Flex w="56px" h="56px" borderRadius="full" alignItems="center" justifyContent="center" mb="6" bg="rgba(52, 211, 153, 0.1)">
						<CircleCheck size={32} color="#34d399" />
					</Flex>
					<Text fontSize="28px" fontWeight="700" color="#e4e4e7" letterSpacing="-0.03em" mb="3">
						All Set
					</Text>
					<Text fontSize="15px" color="rgba(255, 255, 255, 0.45)" maxW="400px" lineHeight="1.6">
						You're ready to start running local LLMs. Add models, register backends, and launch your first server whenever you're ready. You can always re-run this guide from Settings.
					</Text>
				</Box>
			</Box>

			<OnboardingFooter onBack={goPrev} onNext={finishOnboarding} nextLabel="Start Using warpdrv" />
		</Box>
	);
}
