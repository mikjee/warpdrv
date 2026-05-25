import { Box, Text, HStack, VStack, Flex, Button } from '@chakra-ui/react';
import { Server, Play, Mic } from 'lucide-react';
import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { useMutation } from '@/hooks/useQuery';
import { restartServer } from '@/api/services';
import { restartWhisperServer } from '@/api/whisperServices';
import { EServerStatus, EWhisperServerStatus, type IServer, type IWhisperServer } from '@warpcore/shared';
import { StatusDot } from '../StatusDot';
import { TileContainer } from '../TileContainer';

type DisplayServer = {
	id: string;
	serverName: string;
	status: EServerStatus | EWhisperServerStatus;
	isWhisper: boolean;
};

const statusToState = (status: EServerStatus): 'online' | 'loading' | 'error' | 'offline' => {
	if (status === EServerStatus.RUNNING) return 'online';
	if (status === EServerStatus.LOADING) return 'loading';
	if (status === EServerStatus.ERROR) return 'error';
	return 'offline';
};

export const ServersTile = React.memo(() => {
	const navigate = useNavigate();
	const servers = useStore((s) => s.servers);
	const whisperServers = useStore((s) => s.whisperServers);

	const serversArr = useMemo(() => Object.values(servers), [servers]);
	const whisperArr = useMemo(() => Object.values(whisperServers), [whisperServers]);

	const running = useMemo(
		() => serversArr.filter((s) => s.status === EServerStatus.RUNNING),
		[serversArr],
	);
	const errors = useMemo(
		() => serversArr.filter((s) => s.error != null && s.error.length > 0),
		[serversArr],
	);

	const displayServers = useMemo((): DisplayServer[] => {
		const llamaSorted = serversArr
			.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))
			.slice(0, 3);

		const whisperSorted = whisperArr
			.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));

		const mostRecentWhisper = whisperSorted[0];

		if (mostRecentWhisper) {
			const llamaDisplay = llamaSorted.slice(0, 2).map((s) => ({
				id: s.id,
				serverName: s.serverName,
				status: s.status,
				isWhisper: false,
			}));
			llamaDisplay.push({
				id: mostRecentWhisper.id,
				serverName: mostRecentWhisper.serverName,
				status: mostRecentWhisper.status,
				isWhisper: true,
			});
			return llamaDisplay;
		}

		return llamaSorted.slice(0, 3).map((s) => ({
			id: s.id,
			serverName: s.serverName,
			status: s.status,
			isWhisper: false,
		}));
	}, [serversArr, whisperArr]);

	const { mutate: restartMut, loading: loadingLlama } = useMutation<string, IServer | null>(
		useCallback((id: string) => restartServer(id), [])
	);

	const { mutate: restartWhisperMut, loading: loadingWhisper } = useMutation<string, void>(
		useCallback((id: string) => restartWhisperServer(id), [])
	);

	const handleStart = async (id: string, isWhisper: boolean) => {
		if (isWhisper) {
			await restartWhisperMut(id);
		} else {
			await restartMut(id);
		}
	};

	const hasServers = displayServers.length > 0;

	return (
		<TileContainer
			icon={<Server size={18} />}
			label="Servers"
			statusDot={errors.length > 0 ? 'error' : running.length > 0 ? 'online' : 'offline'}
			onClick={() => navigate('/servers')}
		>
			{!hasServers ? (
				<Text fontSize="13px" color="var(--wc-text-muted)">
					No servers configured
				</Text>
			) : (
				<VStack align="stretch" gap="2" w="100%">
					{displayServers.map((srv) => {
						const isRunning = srv.status === EServerStatus.RUNNING || srv.status === EServerStatus.LOADING;
						return (
							<Flex key={srv.id} align="center" justify="space-between" gap="2" h="28px">
								<HStack gap="2" flex="1" minWidth={0}>
									{srv.isWhisper ? (
										<Mic size={12} color={srv.status === EServerStatus.RUNNING ? 'var(--wc-accent-green)' : 'var(--wc-text-muted)'} />
									) : (
										<StatusDot state={statusToState(srv.status as EServerStatus)} />
									)}
									<Box overflow="hidden">
										<Text fontSize="13px" color="var(--wc-text-tertiary)" noOfLines={1}>
											{srv.serverName}
										</Text>
									</Box>
								</HStack>
								{!isRunning && (
									<Button
										size="xs"
										variant="ghost"
bg="var(--wc-accent-blue-bg-8)"
										color="var(--wc-accent-blue)"
										borderRadius="md"
										p="1.5"
										minW="auto"
										h="26px"
										fontSize="11px"
										_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
										onClick={(e) => {
											e.stopPropagation();
											handleStart(srv.id, srv.isWhisper);
										}}
										disabled={loadingLlama || loadingWhisper}
									>
										<Play size={12} />
										Start
									</Button>
								)}
							</Flex>
						);
					})}
				</VStack>
			)}
		</TileContainer>
	);
});
