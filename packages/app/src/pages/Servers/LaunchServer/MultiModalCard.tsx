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
		<Card bg={useMultiModal ? 'var(--wc-accent-yellow-bg-8)' : undefined} borderColor={useMultiModal ? 'var(--wc-accent-yellow-border)' : undefined}>
			<HStack justify="space-between" align="center">
				<HStack gap="3">
					<Flex w="6" h="6" borderRadius="md" alignItems="center" justifyContent="center"
						bg={useMultiModal ? 'var(--wc-accent-yellow-bg-8)' : 'var(--wc-bg-subtle)'}>
						<Eye size={14} color={useMultiModal ? 'var(--wc-accent-yellow)' : 'var(--wc-text-tertiary)'} />
					</Flex>
					<VStack align="start" gap="0.5">
<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Multi-modal</Text>
					<Text fontSize="11px" color="var(--wc-text-tertiary)">Vision requires mmproj.GGUF</Text>
					</VStack>
				</HStack>
				<Switch.Root label="Use multi-modal (mmproj)" checked={useMultiModal} onCheckedChange={(d) => onUseMultiModalChange(d.checked)} disabled={!hasMmproj} color={useMultiModal ? 'var(--wc-accent-yellow)' : 'var(--wc-text-tertiary)'}>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: useMultiModal ? 'var(--wc-accent-yellow)' : 'surface.4' }}>
						<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
					</Switch.Control>
				</Switch.Root>
			</HStack>
		</Card>
	);
});
