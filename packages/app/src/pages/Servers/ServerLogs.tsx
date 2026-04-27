import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Text, HStack, Flex, Button } from '@chakra-ui/react';
import { X, Terminal, Trash2, Download, ArrowDown } from 'lucide-react';
import { useStore } from '@/store';
import { clearServerLogs as clearLogsApi } from '@/api/services';

interface IServerLogsProps {
	serverId: string;
	serverName: string;
	onClose: () => void;
}

const emptyLogs: Array<string> = [];
export const ServerLogs = React.memo(({ serverId, serverName, onClose }: IServerLogsProps) => {
	const logsEndRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);

	const serverLogs = useStore((s) => s.serverLogs[serverId] || emptyLogs);

	useEffect(() => {
		if (autoScroll && logsEndRef.current) {
			logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [serverLogs, autoScroll]);

	const handleClear = useCallback(async () => {
		await clearLogsApi(serverId);
	}, [serverId]);

	const handleDownload = useCallback(() => {
		const blob = new Blob([serverLogs.join('\n')], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${serverName}-logs.txt`;
		a.click();
		URL.revokeObjectURL(url);
	}, [serverLogs]);

	return (
		<Box position="fixed" bottom="20px" right="20px" w="700px" h="400px" bg="#0c0c0f"
			borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" borderTopLeftRadius="xl"
			shadow="0 -8px 40px rgba(0, 0, 0, 0.5)" zIndex="popover"
			display="flex" flexDirection="column" overflow="hidden"
		>
			<Flex px="4" py="2.5" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.02)" flexShrink={0}>
				<HStack gap="2">
					<Terminal size={14} color="rgba(255, 255, 255, 0.4)" />
					<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.6)">Logs — {serverName}</Text>
				</HStack>
				<HStack gap="1">
					<Button size="xs" variant="ghost" color={autoScroll ? '#3381ff' : 'rgba(255, 255, 255, 0.3)'} _hover={{ bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={() => setAutoScroll(!autoScroll)}>
						<ArrowDown size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: 'rgba(255, 255, 255, 0.6)', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={handleDownload}>
						<Download size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" onClick={handleClear}>
						<Trash2 size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose}>
						<X size={12} />
					</Button>
				</HStack>
			</Flex>

			<Box flex="1" overflowY="auto" px="4" py="2" fontFamily='"Geist Mono", monospace' fontSize="11px" lineHeight="1.8">
				{serverLogs.length === 0 ? (
					<Flex h="100%" alignItems="center" justifyContent="center">
						<Text color="rgba(255, 255, 255, 0.15)">No logs yet...</Text>
					</Flex>
				) : (
					serverLogs.map((line: string, i: number) => (
						<Text key={i} color="rgba(255, 255, 255, 0.6)" whiteSpace="pre-wrap" wordBreak="break-all" _hover={{ bg: 'rgba(255, 255, 255, 0.02)' }} px="1" borderRadius="sm">
							{line}
						</Text>
					))
				)}
				<Box ref={logsEndRef} />
			</Box>
		</Box>
	);
});
