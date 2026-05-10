import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Text, HStack, Flex, Button } from '@chakra-ui/react';
import { X, Terminal, Trash2, Download, ArrowDown, Mic } from 'lucide-react';
import { useStore } from '@/store';
import { clearWhisperServerLogs as clearLogsApi } from '@/api/whisperServices';

interface IWhisperServerLogsProps {
	serverId: string;
	serverName: string;
	onClose: () => void;
}

const emptyLogs: Array<string> = [];
export const WhisperServerLogs = React.memo(({ serverId, serverName, onClose }: IWhisperServerLogsProps) => {
	const logsEndRef = useRef<HTMLDivElement>(null);
	const [autoScroll, setAutoScroll] = useState(true);

	const serverLogs = useStore((s) => s.whisperServerLogs[serverId] || emptyLogs);

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
		<Box position="fixed" bottom="20px" right="20px" w="700px" h="400px" bg="var(--wc-bg-dialog)"
			borderWidth="1px" borderColor="var(--wc-border-default)" borderTopLeftRadius="xl"
			shadow="0 -8px 40px rgba(0, 0, 0, 0.5)" zIndex="popover"
			display="flex" flexDirection="column" overflow="hidden"
		>
			<Flex px="4" py="2.5" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)" flexShrink={0}>
				<HStack gap="2">
					<Mic size={14} color="var(--wc-accent-green)" />
					<Text fontSize="12px" fontWeight="600" color="var(--wc-text-secondary)">Logs — {serverName}</Text>
				</HStack>
				<HStack gap="1">
					<Button size="xs" variant="ghost" color={autoScroll ? 'var(--wc-accent-blue)' : 'var(--wc-text-muted)'} _hover={{ bg: 'var(--wc-bg-hover)' }} borderRadius="md" onClick={() => setAutoScroll(!autoScroll)}>
						<ArrowDown size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-hover)' }} borderRadius="md" onClick={handleDownload}>
						<Download size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={handleClear}>
						<Trash2 size={12} />
					</Button>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }} borderRadius="md" onClick={onClose}>
						<X size={12} />
					</Button>
				</HStack>
			</Flex>

			<Box flex="1" overflowY="auto" px="4" py="2" fontFamily='"Geist Mono", monospace' fontSize="11px" lineHeight="1.8">
				{serverLogs.length === 0 ? (
					<Flex h="100%" alignItems="center" justifyContent="center">
						<Text color="var(--wc-text-disabled)">No logs yet...</Text>
					</Flex>
				) : (
					serverLogs.map((line: string, i: number) => (
						<Text key={i} color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-all" _hover={{ bg: 'var(--wc-bg-subtle)' }} px="1" borderRadius="sm">
							{line}
						</Text>
					))
				)}
				<Box ref={logsEndRef} />
			</Box>
		</Box>
	);
});
