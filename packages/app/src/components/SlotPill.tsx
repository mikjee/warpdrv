import { HStack, Text, Box } from '@chakra-ui/react';
import type { ISlotLiveState, ISlotLiveMetadata } from '@warpcore/shared';

interface ISlotPillProps {
	slot: ISlotLiveState;
	metadata: ISlotLiveMetadata | null;
}

export function SlotPill({ slot, metadata }: ISlotPillProps) {
	const isPrompt = slot.isProcessing && slot.prefillProgress !== null;
	const isGen = slot.isProcessing && slot.prefillProgress === null;

	let color: string;
	let label: string;
	let progress: number;

	if (isPrompt) {
		color = '#fbb324';
		const pct = Math.round((slot.prefillProgress ?? 0) * 100);
		label = pct >= 100 ? 'pp' : `pp ${pct}%`;
		progress = slot.prefillProgress ?? 0;
	} else if (isGen) {
		color = '#1acaff';
		label = slot.generatedTokens > 0 ? `gen ${slot.generatedTokens}` : 'gen';
		progress = 0;
	} else {
		color = 'rgba(255, 255, 255, 0.4)';
		label = `idle`;
		progress = 0;
	}

	const msgCount = metadata?.messageCount ?? null;

	return (
		<Box
			position="relative"
			px="2"
			py="1"
			borderRadius="md"
			bg={`color-mix(in srgb, ${color} 10%, transparent)`}
			borderWidth="1px"
			borderColor={`color-mix(in srgb, ${color} 20%, transparent)`}
			minW="80px"
			overflow="hidden"
		>
			<HStack gap="2" fontSize="10px" fontFamily='"Geist Mono", monospace' color={color}>
				<Text fontWeight="600">S{slot.slotId}</Text>
				<Text>{label}</Text>
				{msgCount !== null && (
					<Text color="rgba(255, 255, 255, 0.4)" ml="auto">{msgCount} msg</Text>
				)}
			</HStack>
			<Box
				position="absolute"
				left="0"
				right="0"
				bottom="0"
				height="2px"
				bg="rgba(255, 255, 255, 0.05)"
			>
				<Box
					height="100%"
					width={`${Math.min(100, Math.max(0, progress * 100))}%`}
					bg={color}
					transition="width 0.2s ease-out"
				/>
			</Box>
		</Box>
	);
}
