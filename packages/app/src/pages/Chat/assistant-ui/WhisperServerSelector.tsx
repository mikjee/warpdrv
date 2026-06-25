import { Box, Text, HStack, Slider } from '@chakra-ui/react';
import { Mic, ChevronDown, MicOff } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { EWhisperServerStatus, TWhisperServerId } from '@warpcore/shared';
import { updateSettings } from '@/api/services';

// COMMENTED OUT: per-thread whisper server selection no longer used
// export function parseWhisperThreadMeta(meta: string): { whisperServerId: string | null } {
// 	try {
// 		const parsed = JSON.parse(meta);
// 		return { whisperServerId: parsed.whisperServerId ?? null };
// 	} catch {
// 		return { whisperServerId: null };
// 	}
// }

export const ThreadWhisperServerSelector = React.memo(() => {
	const [open, setOpen] = useState(false);

	const whisperServersMap = useStore(s => s.whisperServers);
	const whisperServers = useMemo(() => Object.values(whisperServersMap).sort((a, b) => {
		const isARunning = a.status === EWhisperServerStatus.RUNNING;
		const isBRunning = b.status === EWhisperServerStatus.RUNNING;
		if (isARunning && !isBRunning) return -1;
		if (!isARunning && isBRunning) return 1;
		return 0;
	}), [whisperServersMap]);

	const selectedWhisperServerId = useStore(s => s.selectedWhisperServerId);
	const setSelectedWhisperServerId = useStore(s => s.setSelectedWhisperServerId);

	// COMMENTED OUT: per-thread whisper server reading no longer used
	// const thread = useStore(s => threadId ? s.threads[threadId] : undefined);
	// const assignedWhisperServerId = useMemo(() =>
	// 	thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
	// 	[thread]
	// );

	const displayServer = useMemo(() => selectedWhisperServerId ? whisperServersMap[selectedWhisperServerId] : null, [
		selectedWhisperServerId,
		whisperServersMap
	]);

	const kokoroInstalled = useStore((s) => s.kokoroStatus?.installed);
	const kokoroSpeed = useStore(s => s.settings.kokoroSpeed ?? 1);

	const handleSelect = useCallback(async (serverId: string) => {
		setOpen(false);
		setSelectedWhisperServerId(serverId);
		// COMMENTED OUT: per-thread whisper server writing no longer used
		// if (threadId) await updateThread(threadId, { whisperServerId: serverId });
	}, [setSelectedWhisperServerId]);

	return (
		<Box position="relative">
			<HStack
				gap="2"
				p="2.5"
				cursor="pointer"
				borderRadius="lg"
				borderWidth="1px"
				borderColor="var(--wc-border-default)"
				_hover={{ bg: 'var(--wc-bg-hover)' }}
				onClick={() => setOpen(!open)}
				fontSize="12px"
				color="var(--wc-text-primary)"
				minW="55px"
				maxW="55px"
			>
				{displayServer?.status === EWhisperServerStatus.RUNNING ? 
					<Mic size={14} color={'var(--wc-accent-green)'} /> :
					<MicOff size={14} color={'var(--wc-text-muted)'} />
				}
				<ChevronDown size={12} style={{ opacity: 0.4 }} />
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
					{kokoroInstalled && (
						<>
							<Box px="3" py="2">
								<HStack justify="space-between" mb="1">
									<Text fontSize="11px" color="var(--wc-text-muted)">TTS Speed</Text>
									<Text fontSize="11px" color="var(--wc-text-tertiary)">{kokoroSpeed.toFixed(1)}x</Text>
								</HStack>
								<Slider.Root
									w="full"
									size="sm"
									colorPalette="blue"
									value={[kokoroSpeed]}
									min={0.5}
									max={3}
									step={0.1}
									onValueChange={(details) => updateSettings({ kokoroSpeed: details.value[0] })}
								>
									<Slider.Control>
										<Slider.Track>
											<Slider.Range />
										</Slider.Track>
										<Slider.Thumbs />
									</Slider.Control>
								</Slider.Root>
							</Box>
							<Box borderBottom="1px" borderColor="var(--wc-border-subtle)" mx="3" />
						</>
					)}
					{whisperServers.map((s) => (
						<HStack
							key={s.id}
							gap="2"
							px="3"
							py="2"
							cursor="pointer"
							bg={selectedWhisperServerId === s.id ? 'var(--wc-bg-selected)' : 'transparent'}
							_hover={{ bg: 'var(--wc-bg-card)' }}
							onClick={() => handleSelect(s.id)}
							fontSize="12px"
							color="var(--wc-text-primary)"
						>
							<Box w="8px" h="8px" borderRadius="full"
								bg={s.status === EWhisperServerStatus.RUNNING ? 'var(--wc-accent-green-icon)' :
									s.status === EWhisperServerStatus.LOADING ? 'var(--wc-accent-yellow-strong)' :
									s.status === EWhisperServerStatus.ERROR ? 'var(--wc-accent-red)' : 'var(--wc-text-disabled)'}
							/>
							<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
								{s.serverName}
							</Text>
						</HStack>
					))}
					{whisperServers.length === 0 && (
						<Text px="3" py="2" fontSize="12px" color="var(--wc-text-faint)">No servers</Text>
					)}
				</Box>
			)}
		</Box>
	);
});
