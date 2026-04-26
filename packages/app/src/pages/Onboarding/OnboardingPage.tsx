import { useState } from 'react';
import { Box } from '@chakra-ui/react';
import { updateSettings } from '@/api/services';
import { StepWelcome } from './steps/StepWelcome';
import { StepModelFolders } from './steps/StepModelFolders';
import { StepGuide } from './steps/StepGuide';
import { StepDone } from './steps/StepDone';

const STEPS = [StepWelcome, StepModelFolders, StepGuide, StepDone];
const TOTAL_STEPS = STEPS.length;

export interface IStepProps {
	goNext: () => void;
	goPrev: () => void;
	finishOnboarding: () => void;
}

export function OnboardingPage() {
	const [currentStep, setCurrentStep] = useState(0);

	const goNext = () => {
		setCurrentStep(prev => Math.min(TOTAL_STEPS - 1, prev + 1));
	};

	const goPrev = () => {
		setCurrentStep(prev => Math.max(0, prev - 1));
	};

	const finishOnboarding = async () => {
		await updateSettings({ isOnboardingComplete: true });
	};

	const StepComponent = STEPS[currentStep];
	const stepProps: IStepProps = { goNext, goPrev, finishOnboarding };

	return (
		<Box
			position="absolute"
			top="0"
			left="0"
			width="100%"
			height="100%"
			zIndex="99999"
			bg="#0e0e0e"
			overflow="auto"
		>
			<StepComponent {...stepProps} />
		</Box>
	);
}
