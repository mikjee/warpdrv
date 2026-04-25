import { Box, Text, HStack } from '@chakra-ui/react';
import { ChevronDown } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { EServerStatus, TServerId } from '@warpcore/shared';
import { updateThread } from '@/api/services';
import { useDependantState } from '@/hooks/useDependantState';

function ServerDot({ status }: { status: EServerStatus }) {
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="#22c55e" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="#f59e0b" flexShrink={0} />;
	if (status === EServerStatus.ERROR) return <Box w="8px" h="8px" borderRadius="full" bg="#ef4444" flexShrink={0} />;
	return <Box w="8px" h="8px" borderRadius="full" bg="rgba(255,255,255,0.15)" flexShrink={0} />;
}

export function parseThreadMeta(meta: string): { serverId: string | null } {
	try {
		const parsed = JSON.parse(meta);
		return { serverId: parsed.serverId ?? null };
	} catch {
		return { serverId: null };
	}
}

export const ThreadServerSelector = React.memo(({
	threadId,
}: {
	threadId: string | null;
}) => {
	const [open, setOpen] = useState(false);
	const thread = useStore(s => s.currentThreadId ? s.threads[s.currentThreadId] : undefined);
	const serversMap = useStore(s => s.servers);
	const servers = useMemo(() => Object.values(serversMap).sort((a,b) => {
		const isARunning = a.status === EServerStatus.RUNNING;
		const isBRunning = b.status === EServerStatus.RUNNING;
		if (isARunning && !isBRunning) return -1;
		else if (!isARunning && isBRunning) return 1;
		else return 0;

	}), [serversMap]);
	const tempThreadServerId = useStore(s => s.tempThreadServerId);
	const setTempThreadServerId = useStore(s => s.setTempThreadServerId);

	const assignedServerId = useMemo(() => 
		thread?.meta ? parseThreadMeta(thread.meta).serverId : null, 
		[thread]
	);

	const threadServerId = useMemo(() => assignedServerId ?? tempThreadServerId, [
		tempThreadServerId,
		assignedServerId,
	]);

	const displayServer = useMemo(() => threadServerId ? serversMap[threadServerId] : null, [
		threadServerId,
		serversMap
	]);

	const handleSelect = useCallback(async (serverId: string) => {
		setOpen(false);
		setTempThreadServerId(serverId);
		if (threadId) await updateThread(threadId, { serverId });
	}, [threadId]);

	return (
		<Box position="relative">
			<HStack
				gap="2"
				p="2.5"
				cursor={'pointer'}
				borderRadius="lg"
				borderWidth="1px"
				borderColor="rgba(255,255,255,0.08)"
				// bg="rgba(255,255,255,0.03)"
				_hover={{ bg: 'rgba(255,255,255,0.05)' }}
				onClick={() => setOpen(!open)}
				fontSize="12px"
				color="rgba(255,255,255,0.7)"
				maxW="180px"
				// minW="180px"
			>
				{displayServer ? (
					<>
						<ServerDot status={displayServer.status} />
						<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="12px">
							{displayServer.serverName}
						</Text>
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				) : (
					<>
						<Text flex="1" color="rgba(255,255,255,0.35)" fontSize="12px">
							Select
						</Text>
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				)}
			</HStack>
			{open && (
				<Box
					position="absolute"
					bottom="100%"
					left="0px"
					mt="2"
					bg="#1a1a1a"
					borderWidth="1px"
					borderColor="rgba(255,255,255,0.1)"
					borderRadius="md"
					zIndex={50}
					py="1"
					maxH="200px"
					overflowY="auto"
					minW="180px"
					maxW="180px"
				>
					{servers.map((s) => (
						<HStack
							key={s.id}
							gap="2"
							px="3"
							py="2"
							cursor="pointer"
							bg={assignedServerId === s.id ? 'rgba(255,255,255,0.06)' : 'transparent'}
							_hover={{ bg: 'rgba(255,255,255,0.04)' }}
							onClick={() => handleSelect(s.id)}
							fontSize="12px"
							color="rgba(255,255,255,0.7)"
						>
							<ServerDot status={s.status} />
							<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
								{s.serverName}
							</Text>
						</HStack>
					))}
					{servers.length === 0 && (
						<Text px="3" py="2" fontSize="12px" color="rgba(255,255,255,0.3)">No servers</Text>
					)}
				</Box>
			)}
		</Box>
	);
});
