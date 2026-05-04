import { Box, Text, HStack, VStack, Flex, Button } from '@chakra-ui/react';
import { Server, Play } from 'lucide-react';
import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store';
import { useMutation } from '@/hooks/useQuery';
import { restartServer } from '@/api/services';
import { EServerStatus, type IServer } from '@warpcore/shared';
import { StatusDot } from '../StatusDot';
import { TileContainer } from '../TileContainer';

const statusToState = (status: EServerStatus): 'online' | 'loading' | 'error' | 'offline' => {
	if (status === EServerStatus.RUNNING) return 'online';
	if (status === EServerStatus.LOADING) return 'loading';
	if (status === EServerStatus.ERROR) return 'error';
	return 'offline';
};

export const ServersTile = React.memo(() => {
	const navigate = useNavigate();
	const servers = useStore((s) => s.servers);
	const serversArr = useMemo(() => Object.values(servers), [servers]);
	const running = useMemo(
		() => serversArr.filter((s) => s.status === EServerStatus.RUNNING),
		[serversArr],
	);
	const errors = useMemo(
		() => serversArr.filter((s) => s.error != null && s.error.length > 0),
		[serversArr],
	);

	const lastUsed = useMemo(() => {
		return serversArr
			.sort((a, b) => {
				const aTime = a.startedAt ?? 0;
				const bTime = b.startedAt ?? 0;
				return bTime - aTime;
			})
			.slice(0, 3);
	}, [serversArr]);

	const { mutate: restartMut, loading } = useMutation<string, IServer | null>(
		useCallback((id: string) => restartServer(id), [])
	);

	const handleStart = async (id: string) => {
		await restartMut(id);
	};

	return (
		<TileContainer
			icon={<Server size={18} />}
			label="Servers"
			statusDot={errors.length > 0 ? 'error' : running.length > 0 ? 'online' : 'offline'}
			onClick={() => navigate('/servers')}
		>
			{lastUsed.length === 0 ? (
				<Text fontSize="13px" color="var(--w-home-tiles-servers-empty)">
					No servers configured
				</Text>
			) : (
				<VStack align="stretch" gap="2" w="100%">
					{lastUsed.map((srv) => {
						const isRunning = srv.status === EServerStatus.RUNNING || srv.status === EServerStatus.LOADING;
						return (
							<Flex key={srv.id} align="center" justify="space-between" gap="2" h="28px">
								<HStack gap="2" flex="1" minWidth={0}>
									<StatusDot state={statusToState(srv.status)} />
									<Box overflow="hidden">
										<Text fontSize="13px" color="var(--w-home-tiles-servers-name)" noOfLines={1}>
											{srv.serverName}
										</Text>
									</Box>
								</HStack>
								{!isRunning && (
									<Button
										size="xs"
										variant="ghost"
										bg="var(--w-home-tiles-servers-start-bg)"
										color="var(--w-home-tiles-servers-start-color)"
										borderRadius="md"
										p="1.5"
										minW="auto"
										h="26px"
										fontSize="11px"
										_hover={{ bg: 'var(--w-home-tiles-servers-start-hover-bg)' }}
										onClick={(e) => {
											e.stopPropagation();
											handleStart(srv.id);
										}}
										disabled={loading}
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
