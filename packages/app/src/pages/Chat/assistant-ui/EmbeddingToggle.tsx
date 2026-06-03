import React, { useMemo, useEffect, useCallback } from 'react';
import { Popover, Text, VStack, Box, HStack, Switch } from '@chakra-ui/react';
import { IconButton } from '@chakra-ui/react';
import { LuDatabaseZap } from 'react-icons/lu';
import { useStore } from '@/store';
import { EServerStatus } from '@warpcore/shared';
import { useThreadAutoEmbed } from '@/hooks/useThreadAutoEmbed';

export const EmbeddingToggle: React.FC = () => {
	const servers = useStore(s => s.servers);
	const selectedEmbeddingServerId = useStore(s => s.selectedEmbeddingServerId);
	const setSelectedEmbeddingServerId = useStore(s => s.setSelectedEmbeddingServerId);
	const { enableAutoEmbed, setEnableAutoEmbed } = useThreadAutoEmbed();

	const embeddingServers = useMemo(() => {
		return Object.values(servers).filter(s => s.params?.useEmbedding && s.status === EServerStatus.RUNNING);
	}, [servers]);

	useEffect(() => {
		if (selectedEmbeddingServerId && servers[selectedEmbeddingServerId]?.status !== EServerStatus.RUNNING) {
			const next = embeddingServers.find(s => s.id !== selectedEmbeddingServerId);
			setSelectedEmbeddingServerId(next?.id ?? null);
		}
	}, [servers, selectedEmbeddingServerId, embeddingServers, setSelectedEmbeddingServerId]);

	const selectedServer = selectedEmbeddingServerId ? servers[selectedEmbeddingServerId] : null;
	const serverName = selectedServer?.serverName ?? selectedServer?.modelPath?.split('/').pop()?.replace('.gguf', '') ?? 'off';
	const serverActive = selectedServer?.status === EServerStatus.RUNNING;

	const handleServerSelect = (serverId: string) => {
		setSelectedEmbeddingServerId(serverId);
	};

	const handleAutoEmbedToggle = useCallback(async (enabled: boolean) => {
		await setEnableAutoEmbed(enabled);
	}, [setEnableAutoEmbed]);

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
					borderColor={serverActive ? 'var(--wc-accent-purple)' : 'var(--wc-border-default)'}
					_hover={{ bg: 'var(--wc-bg-hover)' }}
					color={serverActive ? 'var(--wc-accent-purple)' : 'var(--wc-text-muted)'}
					className="flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors hover:bg-accent"
					title={`Embedding: ${serverName}${enableAutoEmbed ? ' (auto)' : ''}`}
				>
					<LuDatabaseZap size={16} />
					{enableAutoEmbed && (
						<Text fontSize="10px" fontWeight="600" ml="0.5" textTransform="uppercase">Auto</Text>
					)}
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
								<Box pt="1" borderTopWidth="1px" borderColor="var(--wc-border-default)">
									<Switch.Root
										label="Auto-embed messages"
										checked={enableAutoEmbed}
										onCheckedChange={(details) => {
											handleAutoEmbedToggle(details.checked);
										}}
										disabled={!serverActive}
										color={enableAutoEmbed ? 'var(--wc-accent-purple)' : 'var(--wc-text-tertiary)'}
									>
										<HStack gap="2">
											<Switch.HiddenInput />
											<Switch.Control css={{ bg: enableAutoEmbed ? 'var(--wc-accent-purple)' : 'surface.4' }}>
												<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
											</Switch.Control>
											<Switch.Label ml="0" fontSize="12px" color={enableAutoEmbed ? 'var(--wc-accent-purple)' : 'var(--wc-text-muted)'} userSelect="none">
												Auto-embed
											</Switch.Label>
										</HStack>
									</Switch.Root>
								</Box>
							</VStack>
						)}
					</Popover.Body>
				</Popover.Content>
			</Popover.Positioner>
		</Popover.Root>
	);
};
