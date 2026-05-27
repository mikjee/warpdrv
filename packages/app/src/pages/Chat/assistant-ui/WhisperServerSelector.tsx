import { Box, Text, HStack, Slider } from '@chakra-ui/react';
import { Mic, ChevronDown } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store';
import { EWhisperServerStatus, TWhisperServerId } from '@warpcore/shared';
import { updateThread, updateSettings } from '@/api/services';

export function parseWhisperThreadMeta(meta: string): { whisperServerId: string | null } {
	try {
		const parsed = JSON.parse(meta);
		return { whisperServerId: parsed.whisperServerId ?? null };
	} catch {
		return { whisperServerId: null };
	}
}

export const ThreadWhisperServerSelector = React.memo(({
	threadId,
}: {
	threadId: string | null;
}) => {
	const [open, setOpen] = useState(false);

	const thread = useStore(s => threadId ? s.threads[threadId] : undefined);
	const whisperServersMap = useStore(s => s.whisperServers);
	const whisperServers = useMemo(() => Object.values(whisperServersMap).sort((a, b) => {
		const isARunning = a.status === EWhisperServerStatus.RUNNING;
		const isBRunning = b.status === EWhisperServerStatus.RUNNING;
		if (isARunning && !isBRunning) return -1;
		if (!isARunning && isBRunning) return 1;
		return 0;
	}), [whisperServersMap]);

	const tempWhisperServerId = useStore(s => s.tempThreadWhisperServerId);
	const setTempWhisperServerId = useStore(s => s.setTempThreadWhisperServerId);

	const assignedWhisperServerId = useMemo(() =>
		thread?.meta ? parseWhisperThreadMeta(thread.meta).whisperServerId : null,
		[thread]
	);

	const whisperServerId = useMemo(() => assignedWhisperServerId ?? tempWhisperServerId, [
		tempWhisperServerId,
		assignedWhisperServerId,
	]);

	const displayServer = useMemo(() => whisperServerId ? whisperServersMap[whisperServerId] : null, [
		whisperServerId,
		whisperServersMap
	]);

	const kokoroInstalled = useStore((s) => s.kokoroStatus?.installed);
	const kokoroSpeed = useStore(s => s.settings.kokoroSpeed ?? 1);

	const handleSelect = useCallback(async (serverId: string) => {
		setOpen(false);
		setTempWhisperServerId(serverId);
		if (threadId) await updateThread(threadId, { whisperServerId: serverId });
	}, [threadId, setTempWhisperServerId]);

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
				minW="150px"
					maxW="150px"
			>
				<Mic size={14} color={displayServer?.status === EWhisperServerStatus.RUNNING ? 'var(--wc-accent-green)' : 'var(--wc-text-muted)'} />
				{displayServer ? (
					<>
						<Text flex="1" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" fontSize="12px">
							{displayServer.serverName}
						</Text>
						<ChevronDown size={12} style={{ opacity: 0.4 }} />
					</>
				) : (
					<>
						<Text flex="1" color="var(--wc-text-faint)" fontSize="12px">
							STT Server
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
							bg={assignedWhisperServerId === s.id ? 'var(--wc-bg-selected)' : 'transparent'}
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
