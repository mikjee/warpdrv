import { HStack, Box, Text } from '@chakra-ui/react';
import { EServerStatus } from '@warpcore/shared';

const STATUS_CONFIG: Record<EServerStatus, { color: string; label: string }> = {
	[EServerStatus.RUNNING]: { color: '#34d399', label: 'Running' },
	[EServerStatus.LOADING]: { color: '#fbbf24', label: 'Loading' },
	[EServerStatus.STOPPED]: { color: 'rgba(255, 255, 255, 0.3)', label: 'Stopped' },
	[EServerStatus.ERROR]: { color: '#fb7185', label: 'Error' },
};

export function StatusBadge({ status, port }: { status: EServerStatus; port?: number }) {
	const config = STATUS_CONFIG[status] ?? { color: 'rgba(255, 255, 255, 0.3)', label: status };

	// Format label with port info
	let label = config.label;
	if (port != null) {
		if (status === EServerStatus.RUNNING) {
			label = `Port ${port}`;
		} else if (status === EServerStatus.STOPPED) {
			label = `Port ${port}`;
		} else if (status === EServerStatus.LOADING) {
			label = `Loading on port ${port}`;
		} else if (status === EServerStatus.ERROR) {
			label = `Error (port ${port})`;
		}
	}

	return (
		<HStack
			gap="1.5"
			// px="2.5"
			py="1"
			// borderRadius="full"
			// bg={`color-mix(in srgb, ${config.color} 10%, transparent)`}
			// borderWidth="1px"
			// borderColor={`color-mix(in srgb, ${config.color} 20%, transparent)`}
		>
			<Box
				w="6px"
				h="6px"
				borderRadius="full"
				bg={config.color}
				shadow={status === EServerStatus.RUNNING ? `0 0 8px ${config.color}` : 'none'}
				animation={status === EServerStatus.LOADING ? 'pulse 1.5s ease infinite' : undefined}
			/>
			<Text fontSize="10px" fontWeight="600" color={config.color} letterSpacing="0.02em">
				{label}
			</Text>
		</HStack>
	);
}
