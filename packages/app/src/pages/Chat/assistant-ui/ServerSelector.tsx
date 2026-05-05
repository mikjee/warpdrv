import { Box, Text, HStack } from '@chakra-ui/react';
import { ChevronDown, Eye } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { EServerStatus, TServerId, IModel } from '@warpcore/shared';
import { updateThread } from '@/api/services';
import { useDependantState } from '@/hooks/useDependantState';

function ServerDot({ status }: { status: EServerStatus }) {
	if (status === EServerStatus.RUNNING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-green-icon)" flexShrink={0} />;
	if (status === EServerStatus.LOADING) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-yellow-strong)" flexShrink={0} />;
	if (status === EServerStatus.ERROR) return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-red)" flexShrink={0} />;
	return <Box w="8px" h="8px" borderRadius="full" bg="var(--wc-text-disabled)" flexShrink={0} />;
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
	const [shake, setShake] = useState(false);

	useEffect(() => {
		const handler = () => {
			setShake(true);
			setTimeout(() => setShake(false), 450);
		};
		document.addEventListener('server-selector-shake', handler);
		return () => document.removeEventListener('server-selector-shake', handler);
	}, []);
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
		<Box position="relative" className={shake ? 'animate-[jiggle_0.4s_ease-in-out]' : ''}>
			<HStack
				gap="2"
				p="2.5"
				cursor={'pointer'}
				borderRadius="lg"
				borderWidth="1px"
				borderColor="var(--wc-border-default)"
				// bg="var(--wc-bg-surface)"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={() => setOpen(!open)}
				fontSize="12px"
				color="var(--wc-text-primary)"
				maxW="180px"
				// minW="180px"
			>
				{displayServer ? (
					<>
						<ServerDot status={displayServer.status} />
						<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="12px">
							{displayServer.serverName}
						</Text>
						{displayServer.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				) : (
					<>
						<Text flex="1" color="var(--wc-text-faint)" fontSize="12px">
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
					bg="var(--wc-bg-elevated)"
					borderWidth="1px"
					borderColor="var(--wc-border-overlay)"
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
bg={assignedServerId === s.id ? 'var(--wc-bg-hover)' : 'transparent'}
						_hover={{ bg: 'var(--wc-bg-card)' }}
							onClick={() => handleSelect(s.id)}
							fontSize="12px"
							color="var(--wc-text-primary)"
						>
							<ServerDot status={s.status} />
							<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
								{s.serverName}
							</Text>
							{s.useMultiModal && <Eye size={12} color="var(--wc-special-vision-yellow)" />}
						</HStack>
					))}
					{servers.length === 0 && (
						<Text px="3" py="2" fontSize="12px" color="var(--wc-text-faint)">No servers</Text>
					)}
				</Box>
			)}
		</Box>
	);
});
