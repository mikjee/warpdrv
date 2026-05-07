import { Box } from '@chakra-ui/react';
import { EMcpServerStatus } from '@warpcore/bridge';

export function McpStatusDot({ status }: { status: EMcpServerStatus }) {
	const colors: Record<EMcpServerStatus, string> = {
		[EMcpServerStatus.CONNECTED]: 'var(--wc-accent-green-icon)',
		[EMcpServerStatus.CONNECTING]: 'var(--wc-accent-yellow-strong)',
		[EMcpServerStatus.ERROR]: 'var(--wc-accent-red-alt)',
		[EMcpServerStatus.DISCONNECTED]: 'var(--wc-text-disabled)',
	};
	return <Box w="8px" h="8px" borderRadius="full" bg={colors[status]} flexShrink={0} />;
}
