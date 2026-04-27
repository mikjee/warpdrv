import { Box } from '@chakra-ui/react';
import { EMcpServerStatus } from '@warpcore/bridge';

export function McpStatusDot({ status }: { status: EMcpServerStatus }) {
	const colors: Record<EMcpServerStatus, string> = {
		[EMcpServerStatus.CONNECTED]: '#22c55e',
		[EMcpServerStatus.CONNECTING]: '#f59e0b',
		[EMcpServerStatus.ERROR]: '#ef4444',
		[EMcpServerStatus.DISCONNECTED]: 'rgba(255,255,255,0.15)',
	};
	return <Box w="8px" h="8px" borderRadius="full" bg={colors[status]} flexShrink={0} />;
}
