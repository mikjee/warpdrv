import React, { useState, useCallback, useMemo } from 'react';
import { Box, Flex, Text, HStack, VStack, Button, Input, Switch, Textarea, Badge, Portal, Combobox, createListCollection } from '@chakra-ui/react';
import { X, Mic, Play, RotateCcw, Package, Check } from 'lucide-react';
import { DEFAULT_WHISPER_LAUNCH_PARAMS, type IWhisperLaunchParams, type IWhisperModel } from '@warpcore/shared';
import { createWhisperServer, updateWhisperServer } from '@/api/whisperServices';
import { useToast } from '@/components/ToastProvider';
import { useStore } from '@/store';
import { ToggleChip } from '@/pages/Servers/LaunchServer/Helpers';

interface IWhisperLaunchDialogProps {
	onClose: () => void;
	serverId?: string;
}

// Whisper model entry type
type TWhisperModelEntry = {
	model: IWhisperModel;
	file: IWhisperModel['files'][number];
	label: string;
	searchText: string;
};

function WhisperBackendCombobox({ entries, selectedId, onSelect }: {
	entries: { id: string; name: string }[];
	selectedId: string | null;
	onSelect: (id: string) => void;
}) {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		return entries.filter(e => e.name.toLowerCase().includes(inputValue.toLowerCase()));
	}, [entries, inputValue]);

	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({ label: e.name, value: e.id })),
			itemToString: (item) => item.label,
		}),
	[filteredItems]);

	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => { const val = details.value?.[0]; if (val) onSelect(val); }}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedId ? [selectedId] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input
					placeholder="Search backends..."
					bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)"
					fontSize="13px" borderRadius="lg"
					_placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-accent-green)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup><Combobox.ClearTrigger /><Combobox.Trigger /></Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto" bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty><Text fontSize="12px" color="var(--wc-text-disabled)" py="4" textAlign="center">No matches</Text></Combobox.Empty>
						{collection.items.map((item) => (
							<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer"
								_hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-accent-green-bg-8)' }}>
								<HStack gap="3" w="100%">
									<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)">{item.label}</Text>
									<Combobox.ItemIndicator />
								</HStack>
							</Combobox.Item>
						))}
					</Combobox.Content>
				</Combobox.Positioner>
			</Portal>
		</Combobox.Root>
	);
}

function WhisperModelCombobox({ entries, selectedPath, onSelect }: {
	entries: TWhisperModelEntry[];
	selectedPath: string | null;
	onSelect: (path: string) => void;
}) {
	const [inputValue, setInputValue] = useState('');
	const filteredItems = useMemo(() => {
		if (!inputValue) return entries;
		const terms = inputValue.toLowerCase().split(/\s+/).filter(Boolean);
		return entries.filter(e => terms.every(term => e.searchText.includes(term)));
	}, [entries, inputValue]);

	const collection = useMemo(() =>
		createListCollection({
			items: filteredItems.map(e => ({
				label: e.label,
				value: e.file.filePath,
				entry: e,
			})),
			itemToString: (item) => item.label,
			itemToValue: (item) => item.value,
		}),
	[filteredItems]);

	return (
		<Combobox.Root
			collection={collection}
			onValueChange={(details) => {
				const val = details.value?.[0];
				if (val) onSelect(val);
			}}
			onInputValueChange={(details) => setInputValue(details.inputValue)}
			value={selectedPath ? [selectedPath] : []}
			openOnClick
		>
			<Combobox.Control>
				<Combobox.Input
					placeholder="Search whisper models..."
					bg="var(--wc-bg-subtle)"
					borderColor="var(--wc-border-default)"
					color="var(--wc-text-secondary)"
					fontSize="13px"
					borderRadius="lg"
					_placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }}
				/>
				<Combobox.IndicatorGroup>
					<Combobox.ClearTrigger />
					<Combobox.Trigger />
				</Combobox.IndicatorGroup>
			</Combobox.Control>
			<Portal>
				<Combobox.Positioner>
					<Combobox.Content
						maxH="280px" overflowY="auto"
						bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-default)"
						borderRadius="lg" shadow="0 8px 32px rgba(0, 0, 0, 0.5)" p="1"
					>
						<Combobox.Empty>
							<Text fontSize="12px" color="var(--wc-text-disabled)" py="4" textAlign="center">No matches</Text>
						</Combobox.Empty>
						{collection.items.map((item) => {
							const entry = (item as { entry: TWhisperModelEntry }).entry;
							const format = entry.file.format;
							const formatColor = format === 'gguf' ? 'var(--wc-accent-blue)' : 'var(--wc-accent-purple)';
							return (
								<Combobox.Item
									key={item.value}
									item={item}
									px="3" py="2" borderRadius="md" cursor="pointer"
									_hover={{ bg: 'var(--wc-bg-hover)' }}
									_highlighted={{ bg: 'var(--wc-bg-card)' }}
								>
									<HStack gap="3" w="100%">
										<Box flex="1" minW="0">
											<Text fontSize="12px" fontWeight="500" color="var(--wc-text-primary)" lineClamp={1}>{entry.model.name}</Text>
											<Text fontSize="10px" color="var(--wc-text-tertiary)" mt="0.5">{entry.label}</Text>
										</Box>
										<HStack gap="2" flexShrink={0}>
											<Badge px="1.5" py="0" borderRadius="sm" fontSize="10px" fontWeight="600"
												bg={`color-mix(in srgb, ${formatColor} 12%, transparent)`} color={formatColor}>
												{format.toUpperCase()}
											</Badge>
											<Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>
												{entry.model.totalSizeMb.toFixed(1)} MB
											</Text>
										</HStack>
										<Combobox.ItemIndicator />
									</HStack>
								</Combobox.Item>
							);
						})}
					</Combobox.Content>
				</Combobox.Positioner>
			</Portal>
		</Combobox.Root>
	);
}

// Card wrapper matching LaunchServer card style
function Card({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" bg="var(--wc-bg-surface)" overflow="hidden">
			<Box px="4" py="3" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)">
				<Text fontSize="13px" fontWeight="600" color="var(--wc-text-heading)">{title}</Text>
			</Box>
			<Box p="4">
				{children}
			</Box>
		</Box>
	);
}

export const WhisperLaunchDialog = React.memo(({ onClose, serverId }: IWhisperLaunchDialogProps) => {
	const { toast } = useToast();
	const server = useStore(s => serverId ? s.whisperServers[serverId] : null);
	const isEdit = !!server;

	const whisperBackends = useStore((s) => s.whisperBackends);
	const whisperBackendsArr = useMemo(() => Object.values(whisperBackends), [whisperBackends]);

	const [selectedModelPath, setSelectedModelPath] = useState<string | null>(server?.modelPath ?? null);
	const [selectedBackendId, setSelectedBackendId] = useState<string | null>(server?.backendId ?? null);
	const [serverName, setServerName] = useState<string>(server?.serverName ?? '');
	const [serverAliasesInput, setServerAliasesInput] = useState<string>(server?.serverAlias?.join(', ') ?? '');
	const [autoLaunch, setAutoLaunch] = useState<boolean>(server?.autoLaunch ?? false);
	const [launching, setLaunching] = useState(false);

	const [params, setParams] = useState<IWhisperLaunchParams>(server?.params ?? DEFAULT_WHISPER_LAUNCH_PARAMS);

	const updateParam = <K extends keyof IWhisperLaunchParams>(key: K, value: IWhisperLaunchParams[K]) => {
		setParams(prev => ({ ...prev, [key]: value }));
	};

	const whisperModels = useStore((s) => s.whisperModels);
	const whisperModelsArr = useMemo(() => Object.values(whisperModels ?? {}), [whisperModels]);

	// Flatten whisper models to selectable entries
	const whisperModelEntries = useMemo(() => {
		return whisperModelsArr.flatMap(m =>
			m.files
				.map(f => ({
					model: m,
					file: f,
					label: f.fileName,
					searchText: `${m.name} ${f.fileName} ${f.format}`.toLowerCase(),
				}))
		);
	}, [whisperModelsArr]);

	const selectedWhisperEntry = useMemo(
		() => whisperModelEntries.find(e => e.file.filePath === selectedModelPath) ?? null,
		[whisperModelEntries, selectedModelPath]
	);

	const handleLaunch = async () => {
		if (!selectedBackendId) {
			toast('error', 'Select a whisper backend');
			return;
		}
		if (!selectedModelPath) {
			toast('error', 'Select a model file');
			return;
		}

		setLaunching(true);
		try {
			const payload = {
				backendId: selectedBackendId,
				modelPath: selectedModelPath,
				serverName: serverName.trim() || null,
				params,
				serverAlias: serverAliasesInput.trim() ? serverAliasesInput.split(',').map((a: string) => a.trim()).filter(Boolean) : [],
				autoLaunch,
			};

			if (isEdit && serverId) {
				await updateWhisperServer(serverId, { ...payload, relaunch: true });
				toast('success', 'Whisper server updated');
			} else {
				await createWhisperServer(payload);
				toast('success', 'Whisper server launched');
			}
			onClose();
		} catch (err) {
			toast('error', String(err));
		} finally {
			setLaunching(false);
		}
	};

	const canLaunch = selectedModelPath && selectedBackendId && !launching;

	return (
		<Box position="fixed" inset="6px" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius="12px" overflow="hidden">
			<Box position="absolute" inset="0" bg="var(--wc-overlay-modal)" backdropFilter="blur(8px)" onClick={onClose} />
			<Box position="relative" w="960px" maxW="95vw" maxH="90vh" bg="var(--wc-bg-dialog)" borderWidth="1px"
				borderColor="var(--wc-border-default)" borderRadius="2xl"
				shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column"
			>
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center"
							bgGradient="to-br"
							gradientFrom="var(--wc-accent-green-bg-8)"
							gradientTo="var(--wc-accent-blue-bg-8)"
							borderWidth="1px" borderColor="var(--wc-accent-green-border)"
						>
							<Mic size={18} color="var(--wc-accent-green)" />
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="var(--wc-text-primary)" letterSpacing="-0.01em">
								{isEdit ? 'Edit Whisper Server' : 'Launch Whisper Server'}
							</Text>
							<Text fontSize="12px" color="var(--wc-text-tertiary)">
								{isEdit ? 'Modify launch parameters — requires relaunch' : 'Configure and start a whisper-server instance'}
							</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-hover)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<Flex gap="6">
						{/* Left column */}
						<VStack align="stretch" gap="5" flex="1" minW="0">
							<Card title="Backend">
								{whisperBackendsArr.length === 0 ? (
									<Text fontSize="12px" color="var(--wc-text-faint)">No whisper backends. Add one in Backends page.</Text>
								) : (
									<WhisperBackendCombobox
										entries={whisperBackendsArr.map(b => ({ id: b.id, name: b.name }))}
										selectedId={selectedBackendId}
										onSelect={setSelectedBackendId}
									/>
								)}
							</Card>

							<Card title="Model">
								{whisperModelEntries.length === 0 ? (
									<Text fontSize="12px" color="var(--wc-text-muted)">No whisper models scanned.</Text>
								) : (
									<WhisperModelCombobox entries={whisperModelEntries} selectedPath={selectedModelPath} onSelect={setSelectedModelPath} />
								)}
								{selectedWhisperEntry && (
									<HStack mt="2" gap="4" px="3" py="2" bg="var(--wc-accent-green-bg-8)" borderRadius="lg" borderWidth="1px" borderColor="var(--wc-accent-green-border)">
										<HStack gap="1.5">
											<Package size={12} color="var(--wc-text-muted)" />
											<Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>
												{selectedWhisperEntry.file.format.toUpperCase()}
											</Text>
										</HStack>
										<Text fontSize="11px" color="var(--wc-text-tertiary)" fontFamily='"Geist Mono", monospace'>
											{selectedWhisperEntry.model.totalSizeMb.toFixed(1)} MB
										</Text>
									</HStack>
								)}
							</Card>

							<Card title="Server Info">
								<VStack gap="3" align="stretch">
									<Box>
										<Text fontSize="11px" color="var(--wc-text-muted)" mb="1.5">Server Name <Text as="span" color="var(--wc-text-faint)" fontWeight="400">(optional)</Text></Text>
										<Input
											value={serverName} onChange={(e) => setServerName(e.target.value)}
											placeholder={selectedModelPath ? selectedModelPath.split('/').pop()?.replace(/\.(gguf|bin)$/, '') ?? 'whisper-server' : 'whisper-server'}
											bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg"
											_placeholder={{ color: 'var(--wc-text-faint)' }}
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
										/>
									</Box>
									<Box>
										<Text fontSize="11px" color="var(--wc-text-muted)" mb="1.5">Aliases <Text as="span" color="var(--wc-text-faint)" fontWeight="400">(comma-separated, for proxy routing)</Text></Text>
										<Input
											value={serverAliasesInput} onChange={(e) => setServerAliasesInput(e.target.value)}
											placeholder="e.g. whisper-large, stt-primary"
											bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)" fontSize="13px" borderRadius="lg"
											_placeholder={{ color: 'var(--wc-text-faint)' }}
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
										/>
									</Box>
								</VStack>
							</Card>
						</VStack>

						{/* Right column */}
						<VStack gap="5" flex="1" minW="0" align="stretch">
							<Card title="Parameters">
								<Flex gap="4" flexWrap="wrap">
									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Threads (-t)</Text>
										<Input type="number" value={params.threads} onChange={e => updateParam('threads', Number(e.target.value))} min={0} max={128}
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
											fontSize="12px" borderRadius="lg" textAlign="center"
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
									</VStack>

									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Processors (-p)</Text>
										<Input type="number" value={params.processors} onChange={e => updateParam('processors', Number(e.target.value))} min={0} max={32}
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
											fontSize="12px" borderRadius="lg" textAlign="center"
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
									</VStack>

									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Beam Size (-bs)</Text>
										<Input type="number" value={params.beamSize} onChange={e => updateParam('beamSize', Number(e.target.value))} min={0} max={10}
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
											fontSize="12px" borderRadius="lg" textAlign="center"
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
									</VStack>

									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Temperature (-tp)</Text>
										<Input type="number" value={params.temperature} onChange={e => updateParam('temperature', Number(e.target.value))} min={0} max={1} step={0.1}
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
											fontSize="12px" borderRadius="lg" textAlign="center"
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
									</VStack>
								</Flex>

								<Flex gap="4" mt="3" flexWrap="wrap">
									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Language (-l)</Text>
										<Input
											value={params.language} onChange={(e) => updateParam('language', e.target.value)}
											placeholder="auto"
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)" fontSize="12px" borderRadius="lg"
											_placeholder={{ color: 'var(--wc-text-faint)' }}
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
										/>
									</VStack>

									<VStack gap="2" flex="1" minW="100px">
										<Text fontSize="11px" color="var(--wc-text-muted)">Prompt</Text>
										<Input
											value={params.prompt} onChange={(e) => updateParam('prompt', e.target.value)}
											placeholder="Initial prompt"
											size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)" fontSize="12px" borderRadius="lg"
											_placeholder={{ color: 'var(--wc-text-faint)' }}
											_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
										/>
									</VStack>
								</Flex>
							</Card>

							<Card title="Options">
								<VStack align="stretch" gap="3">
									<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Options</Text>
									<HStack gap="2" flexWrap="wrap">
										<ToggleChip label="No GPU" active={params.noGpu} onClick={() => updateParam('noGpu', !params.noGpu)} />
										<ToggleChip label="Flash Attention" active={params.flashAttn} onClick={() => updateParam('flashAttn', !params.flashAttn)} />
										<ToggleChip label="Translate" active={params.translate} onClick={() => updateParam('translate', !params.translate)} />
										<ToggleChip label="Convert (ffmpeg)" active={params.convert} onClick={() => updateParam('convert', !params.convert)} />
									</HStack>
								</VStack>
							</Card>

							<Card title="Extra Args">
								<Textarea
									value={params.extraArgs} onChange={(e) => updateParam('extraArgs', e.target.value)}
									placeholder="Additional whisper-server flags"
									rows={3} resize="none"
									size="sm" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)"
									color="var(--wc-text-primary)" fontSize="12px" borderRadius="lg"
									_placeholder={{ color: 'var(--wc-text-faint)' }}
									_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
								/>
							</Card>
						</VStack>
					</Flex>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="space-between" align="center" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
					<HStack gap="4">
						<Switch.Root label="Auto-launch at startup" checked={autoLaunch} onCheckedChange={(d) => setAutoLaunch(d.checked)} color={autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-bg-card)' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
							<Switch.Label ml="2" fontSize="13px" color={autoLaunch ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'} userSelect="none">Auto-launch at startup</Switch.Label>
						</Switch.Root>
					</HStack>
					<HStack gap="2">
						<Button size="sm" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-secondary)', bg: 'var(--wc-bg-hover)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
						{isEdit ? (
							<Button size="sm" disabled={!canLaunch || launching}
								bgGradient="to-r" gradientFrom="var(--wc-gradient-yellow-from)" gradientTo="var(--wc-gradient-yellow-to)" color="var(--wc-bg-elevated)"
								borderWidth="1px" borderColor="var(--wc-accent-yellow-border)"
								_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--wc-accent-yellow-focus)' }}
								_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
								transition="all 0.2s ease" onClick={handleLaunch}>
								{launching ? <Box className="animate-spin" w="4" h="4" border="2px solid currentColor" borderTopColor="transparent" borderRadius="full" /> : <RotateCcw size={14} />}
								Restart
							</Button>
						) : (
							<Button size="sm" disabled={!canLaunch || launching}
								bgGradient="to-r" gradientFrom="var(--wc-gradient-green-from)" gradientTo="var(--wc-gradient-green-to)" color="white"
								_hover={{ opacity: 0.9, shadow: '0 4px 20px var(--wc-accent-green-focus)' }}
								_disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="6"
								transition="all 0.2s ease" onClick={handleLaunch}>
								{launching ? <Box className="animate-spin" w="4" h="4" border="2px solid currentColor" borderTopColor="transparent" borderRadius="full" /> : <Play size={14} />}
								Launch
							</Button>
						)}
					</HStack>
				</Flex>
			</Box>
		</Box>
	);
});
