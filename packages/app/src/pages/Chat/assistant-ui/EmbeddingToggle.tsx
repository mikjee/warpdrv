import React, { useMemo, useEffect } from 'react';
import { Popover, Text, VStack, Box } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import { LuDatabaseZap } from 'react-icons/lu';
import { useStore } from '@/store';
import { EServerStatus } from '@warpcore/shared';

export const EmbeddingToggle: React.FC = () => {
	const servers = useStore(s => s.servers);
	const selectedEmbeddingServerId = useStore(s => s.selectedEmbeddingServerId);
	const embeddingEnabled = useStore(s => s.embeddingEnabled);
	const setSelectedEmbeddingServerId = useStore(s => s.setSelectedEmbeddingServerId);
	const setEmbeddingEnabled = useStore(s => s.setEmbeddingEnabled);

	const embeddingServers = useMemo(() => {
		return Object.values(servers).filter(s => s.params?.useEmbedding && s.status === EServerStatus.RUNNING);
	}, [servers]);

	useEffect(() => {
		if (!selectedEmbeddingServerId && embeddingEnabled && embeddingServers.length > 0) {
			setSelectedEmbeddingServerId(embeddingServers[0]!.id);
		}
	}, [embeddingServers, selectedEmbeddingServerId, embeddingEnabled, setSelectedEmbeddingServerId]);

	useEffect(() => {
		if (selectedEmbeddingServerId && servers[selectedEmbeddingServerId]?.status !== EServerStatus.RUNNING) {
			const next = embeddingServers.find(s => s.id !== selectedEmbeddingServerId);
			setSelectedEmbeddingServerId(next?.id ?? null);
		}
	}, [servers, selectedEmbeddingServerId, embeddingServers, setSelectedEmbeddingServerId]);

	const selectedServer = selectedEmbeddingServerId ? servers[selectedEmbeddingServerId] : null;
	const serverName = selectedServer?.serverName ?? selectedServer?.modelPath?.split('/').pop()?.replace('.gguf', '') ?? 'off';
	const color = embeddingEnabled ? 'var(--wc-accent-purple)' : 'var(--wc-text-muted)';

	const handleClick = () => {
		if (embeddingEnabled) {
			setEmbeddingEnabled(false);
		} else if (embeddingServers.length > 0) {
			if (!selectedEmbeddingServerId) setSelectedEmbeddingServerId(embeddingServers[0]!.id);
			setEmbeddingEnabled(true);
		}
	};

	const handleServerSelect = (serverId: string) => {
		setSelectedEmbeddingServerId(serverId);
		if (!embeddingEnabled) setEmbeddingEnabled(true);
	};

	return (
		<Popover.Root lazyMount unmountOnExit>
			<Popover.Trigger unstyled asChild>
				<IconButton
					variant="outline"
					size="md"
					px="3"
					ml="1"
					borderRadius="lg"
					borderWidth="1px"
					borderColor={embeddingEnabled ? color : 'var(--wc-border-default)'}
					_hover={{ bg: 'var(--wc-bg-hover)' }}
					color={color}
					onClick={handleClick}
					className="flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-accent"
					title={`Embedding: ${serverName} (click to toggle/select)`}
				>
					<LuDatabaseZap className={embeddingEnabled ? '' : 'opacity-40'} />
					<span style={{ fontSize: '12px' }}>{serverName}</span>
				</IconButton>
			</Popover.Trigger>
			<Popover.Positioner>
				<Popover.Content
					w="240px"
					bg="var(--wc-bg-elevated)"
					borderWidth="1px"
					borderColor="var(--wc-border-overlay)"
					borderRadius="lg"
					shadow="0 8px 32px var(--wc-overlay-modal)"
				>
					<Popover.Body p="2">
						{embeddingServers.length === 0 ? (
							<Text fontSize="12px" color="var(--wc-text-muted)" textAlign="center" py="2">No embedding servers running</Text>
						) : (
							<VStack align="stretch" gap="0.5">
								{embeddingServers.map(server => {
									const name = server.serverName ?? server.modelPath?.split('/').pop()?.replace('.gguf', '') ?? 'Unknown';
									const isSelected = selectedEmbeddingServerId === server.id;
									return (
										<Box
											key={server.id}
											px="2"
											py="1.5"
											borderRadius="md"
											bg={isSelected ? 'var(--wc-accent-purple-bg-8)' : 'transparent'}
											borderWidth="1px"
											borderColor={isSelected ? 'var(--wc-accent-purple-border)' : 'transparent'}
											cursor="pointer"
											_hover={{ bg: 'var(--wc-bg-hover)' }}
											onClick={(e) => { e.stopPropagation(); handleServerSelect(server.id); }}
										>
											<Text fontSize="12px" color="var(--wc-text-primary)" fontWeight="500" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">{name}</Text>
											<Text fontSize="10px" color="var(--wc-text-muted)">Port {server.port}</Text>
										</Box>
									);
								})}
							</VStack>
						)}
					</Popover.Body>
				</Popover.Content>
			</Popover.Positioner>
		</Popover.Root>
	);
};
