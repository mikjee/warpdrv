import React from 'react';
import { Box, VStack, HStack, Flex, Text, Input } from '@chakra-ui/react';
import { type ILaunchParams } from '@warpcore/shared';
import { Card } from '@/components/Card';
import { ToggleChip, NumberField } from './Helpers';

export const OptionsCard = React.memo(({
	params,
	onParamChange,
}: {
	params: ILaunchParams;
	onParamChange: (key: keyof ILaunchParams, value: ILaunchParams[keyof ILaunchParams]) => void;
}) => {
	return (
		<Card>
			<VStack align="stretch" gap="3">
				<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Options</Text>
				<HStack gap="2" flexWrap="wrap">
					<ToggleChip label="Flash Attention" active={params.flashAttn} onClick={() => onParamChange('flashAttn', !params.flashAttn)} />
					<ToggleChip label="MLock" active={params.mlock} onClick={() => onParamChange('mlock', !params.mlock)} />
					<ToggleChip label="MMap" active={params.mmap} onClick={() => onParamChange('mmap', !params.mmap)} />
					<ToggleChip label="Direct I/O" active={params.directIo} onClick={() => onParamChange('directIo', !params.directIo)} />
					<ToggleChip label="No Warmup" active={params.noWarmup} onClick={() => onParamChange('noWarmup', !params.noWarmup)} />
					<ToggleChip label="Jinja" active={params.jinja} onClick={() => onParamChange('jinja', !params.jinja)} />
					<ToggleChip label="SWA Full" active={params.swaFull} onClick={() => onParamChange('swaFull', !params.swaFull)} />
				</HStack>
				<Flex gap="4">
					<NumberField label="Batch Size" value={params.batchSize} onChange={v => onParamChange('batchSize', v)} min={1} step={256} />
					<NumberField label="Micro Batch" value={params.ubatchSize} onChange={v => onParamChange('ubatchSize', v)} min={1} step={64} />
				</Flex>
				<Flex gap="4">
					<NumberField label="Threads" value={params.threads} onChange={v => onParamChange('threads', v)} min={0} suffix="0 = auto" />
					<NumberField label="Threads (Batch)" value={params.threadsBatch} onChange={v => onParamChange('threadsBatch', v)} min={0} suffix="0 = auto" />
				</Flex>
				<Box>
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Chat Template</Text>
					<Input placeholder="Auto-detect" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.chatTemplate} onChange={e => onParamChange('chatTemplate', e.target.value)} />
				</Box>
				<Box>
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Custom Flags</Text>
					<Input placeholder="--some-flag value" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={params.extraArgs} onChange={e => onParamChange('extraArgs', e.target.value)} />
				</Box>
			</VStack>
		</Card>
	);
});
