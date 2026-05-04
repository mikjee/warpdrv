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
		<Card bg={useMultiModal ? 'var(--w-servers-launch-multimodal-bg-active)' : undefined} borderColor={useMultiModal ? 'var(--w-servers-launch-multimodal-border-active)' : undefined}>
			<HStack justify="space-between" align="center">
				<HStack gap="3">
					<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
						bg={useMultiModal ? 'var(--w-servers-launch-multimodal-icon-bg-active)' : 'var(--w-servers-launch-multimodal-icon-bg-inactive)'}>
						<Eye size={14} color={useMultiModal ? 'var(--w-servers-launch-switch-active-yellow)' : 'var(--w-servers-launch-text-subtitle)'} />
					</Flex>
					<VStack align="start" gap="0.5">
						<Text fontSize="12px" fontWeight="600" color="var(--w-servers-launch-model-label)" textTransform="uppercase" letterSpacing="0.05em">Multi-modal</Text>
						<Text fontSize="11px" color="var(--w-servers-launch-text-subtitle)">Vision requires mmproj.GGUF</Text>
					</VStack>
				</HStack>
				<Switch.Root label="Use multi-modal (mmproj)" checked={useMultiModal} onCheckedChange={(d) => onUseMultiModalChange(d.checked)} disabled={!hasMmproj} color={useMultiModal ? 'var(--w-servers-launch-switch-active-yellow)' : 'var(--w-servers-launch-switch-inactive)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: useMultiModal ? 'var(--w-servers-launch-switch-active-yellow)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--w-servers-launch-switch-thumb)' }} />
					</Switch.Control>
				</Switch.Root>
			</HStack>
		</Card>
	);
});
