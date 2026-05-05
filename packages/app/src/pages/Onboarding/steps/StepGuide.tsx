import { Box, Text } from '@chakra-ui/react';
import { ImageCarousel } from '../components/ImageCarousel';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

const GUIDE_SLIDES = [
	{
		title: 'Download Models from the Hub',
		description: 'Browse the Hub page to search for GGUF models from HuggingFace. Filter by parameters, sort by downloads, and download directly to your model folders.',
		image: '/screenshots/hub.png',
	},
	{
		title: 'Add a Backend',
		description: 'Register your llama.cpp builds on the Backends page. WarpCore validates the binary and detects available GPU devices for each backend.',
		image: '/screenshots/backends.png',
	},
	{
		title: 'Launch a Server',
		description: 'Click the launch button on the Servers page. Pick a backend, select a model, configure GPU layers and context size, then start your inference server.',
		image: '/screenshots/launch.png',
	},
];

export function StepGuide({ goNext, goPrev, finishOnboarding }: IStepProps) {
	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="Getting Started Guide" step={2} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" px="4" py="4" overflow="auto">
				<Box w="100%" h="100%">
					<Text fontSize="14px" color="var(--wc-text-muted)" textAlign="center" mb="6">
						A quick walkthrough of the key features
					</Text>
					<ImageCarousel slides={GUIDE_SLIDES} />
				</Box>
			</Box>

			<OnboardingFooter onBack={goPrev} onNext={goNext} />
		</Box>
	);
}
