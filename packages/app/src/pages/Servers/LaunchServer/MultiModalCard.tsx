import React from 'react';
import { Flex, HStack, VStack, Text, Switch } from '@chakra-ui/react';
import { Eye } from 'lucide-react';
import { Card } from '@/components/Card';

export const MultiModalCard = React.memo(({
	useMultiModal,
	onUseMultiModalChange,
	hasMmproj,
}: {
	useMultiModal: boolean;
	onUseMultiModalChange: (v: boolean) => void;
	hasMmproj: boolean;
}) => {
	return (
		<Card bg={useMultiModal ? 'rgba(251, 191, 36, 0.03)' : undefined} borderColor={useMultiModal ? 'rgba(251, 191, 36, 0.12)' : undefined}>
			<HStack justify="space-between" align="center">
				<HStack gap="3">
					<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
						bg={useMultiModal ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255, 255, 255, 0.04)'}>
						<Eye size={14} color={useMultiModal ? '#fbbf24' : 'rgba(255, 255, 255, 0.3)'} />
					</Flex>
					<VStack align="start" gap="0.5">
						<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Multi-modal</Text>
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">Vision requires mmproj.GGUF</Text>
					</VStack>
				</HStack>
				<Switch.Root label="Use multi-modal (mmproj)" checked={useMultiModal} onCheckedChange={(d) => onUseMultiModalChange(d.checked)} disabled={!hasMmproj} color={useMultiModal ? '#fbbf24' : 'rgba(255, 255, 255, 0.4)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: useMultiModal ? '#fbbf24' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
					</Switch.Control>
				</Switch.Root>
			</HStack>
		</Card>
	);
});
