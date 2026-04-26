import { Box, Button, Flex } from '@chakra-ui/react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface IOnboardingFooterProps {
	onBack?: () => void;
	onNext?: () => void;
	backLabel?: string;
	nextLabel?: string;
	disableBack?: boolean;
}

export function OnboardingFooter({
	onBack,
	onNext,
	backLabel = 'Back',
	nextLabel = 'Next',
	disableBack = false,
}: IOnboardingFooterProps) {
	return (
		<Box
			position="sticky"
			bottom="0"
			bg="linear-gradient(to top, #0e0e0e 80%, transparent)"
			pt="8"
			pb="6"
		>
			<Flex justify="space-between" align="center" maxW="560px" mx="auto" px="4">
				<Button
					variant="ghost"
					color="rgba(255, 255, 255, 0.4)"
					_hover={{ color: 'rgba(255, 255, 255, 0.7)' }}
					borderRadius="lg"
					fontSize="13px"
					leftIcon={<ArrowLeft size={16} />}
					onClick={onBack}
					disabled={disableBack}
				>
					{backLabel}
				</Button>

				<Button
					bg="#3381ff"
					color="white"
					_hover={{ bg: '#1b5ff5' }}
					borderRadius="lg"
					fontSize="13px"
					fontWeight="500"
					rightIcon={<ArrowRight size={16} />}
					onClick={onNext}
				>
					{nextLabel}
				</Button>
			</Flex>
		</Box>
	);
}
