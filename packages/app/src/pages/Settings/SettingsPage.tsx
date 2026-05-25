import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Switch, Combobox, createListCollection, Portal, NativeSelect, NativeSelectField } from '@chakra-ui/react';
import { Settings, FolderOpen, Plus, Trash2, Save, ChevronDown, FolderInput, BookOpen, Mic } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { useMutation } from '../../hooks/useQuery';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { updateSettings, startProxy, stopProxy } from '../../api/services';
import type { ISettings } from '@warpcore/shared';
import { ETheme } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';
import { useStore } from '../../store';

// Feature detection: try to import Tauri's autostart plugin.
// Returns the API functions if running in Tauri, null otherwise.
async function getAutostartApi(): Promise<{ isEnabled: () => Promise<boolean>; enable: () => Promise<void>; disable: () => Promise<void> } | null> {
	try {
		const mod = await import('@tauri-apps/plugin-autostart');
		return {
			isEnabled: mod.isEnabled,
			enable: mod.enable,
			disable: mod.disable,
		};
	} catch {
		return null;
	}
}

export function SettingsPage() {
	const { toast } = useToast();
	const settings = useStore(s => s.settings);

	const [modelRoots, setModelRoots] = useDependantState(settings.modelRoots);
	const [portStart, setPortStart] = useDependantState(settings.portRangeStart);
	const [portEnd, setPortEnd] = useDependantState(settings.portRangeEnd);
	const [apiHost, setApiHost] = useDependantState(settings.apiHost);
	const [apiPort, setApiPort] = useDependantState(settings.apiPort);
	const [proxyEnabled, setProxyEnabled] = useDependantState(settings.proxyEnabled);
	const [proxyPort, setProxyPort] = useDependantState(settings.proxyPort);
	const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null);
	const [startMinimized, setStartMinimized] = useDependantState(settings.startMinimized);
	const [checkpointsPath, setCheckpointsPath] = useDependantState(settings.checkpointsPath);
	const [maxCheckpointDiskGB, setMaxCheckpointDiskGB] = useDependantState(settings.maxCheckpointDiskGB);
	const [disableTitleGen, setDisableTitleGen] = useDependantState(settings.disableTitleGen);
	const [micDeviceId, setMicDeviceId] = useDependantState(settings.micDeviceId ?? '');
	const [kokoroVoice, setKokoroVoice] = useDependantState(settings.kokoroVoice ?? 'af_heart');
	const [builtinMcpPort, setBuiltinMcpPort] = useDependantState(settings.builtinMcpPort ?? 11437);
	const [builtinMcpExposeExternal, setBuiltinMcpExposeExternal] = useDependantState(settings.builtinMcpExposeExternal ?? false);
	const [fsAllowedRoots, setFsAllowedRoots] = useDependantState<string[]>(settings.fsAllowedRoots ?? []);
	const [newFsRoot, setNewFsRoot] = useState('');
	const handleBrowseFsRoot = async () => {
		if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
			try {
				const mod = await import('@tauri-apps/plugin-dialog');
				const path = await mod.open({ directory: true, multiple: false });
				if (path && typeof path === 'string') setNewFsRoot(path);
			} catch (err) {
				console.error('[Settings] Failed to open directory picker:', err);
			}
		} else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
			try {
				const handle = await (window as any).showDirectoryPicker();
				if (handle) setNewFsRoot(handle.name);
			} catch (err: any) {
				if (err.name !== 'AbortError') console.error('[Settings] Failed to open directory picker:', err);
			}
		} else {
			toast('error', 'Directory picker not supported in this browser. Please type the path manually.');
		}
	};
	const [micDevices, setMicDevices] = useState<Array<{ id: string; label: string }>>([]);
	const [micPermissionGranted, setMicPermissionGranted] = useState(false);
	const [newRoot, setNewRoot] = useState('');
	const [saved, setSaved] = useState(false);
	const [isDirty, setIsDirty] = useState(false);
	const [localTheme, setLocalTheme] = useDependantState(settings.theme ?? ETheme.DARK);
	const themeCollection = createListCollection({
		items: [
			{ label: 'Amoled', value: ETheme.AMOLED },
			{ label: 'Catppuccin (Latte)', value: ETheme.CATPPUCCIN_LATTE },
			{ label: 'Catppuccin (Mocha)', value: ETheme.CATPPUCCIN_MOCHA },
			{ label: 'Dark', value: ETheme.DARK },
			{ label: 'Dracula', value: ETheme.DRACULA_DARK },
			{ label: 'Dracula Light', value: ETheme.DRACULA_LIGHT },
			{ label: 'Everforest Hard', value: ETheme.EVERFOREST_HARD },
			{ label: 'GitHub Dark', value: ETheme.GITHUB_DARK },
			{ label: 'GitHub Light', value: ETheme.GITHUB_LIGHT },
			{ label: 'Gruvbox', value: ETheme.GRUVBOX },
			{ label: 'Gruvbox Hard', value: ETheme.GRUVBOX_HARD },
			{ label: 'Kanagawa', value: ETheme.KANAGAWA },
			{ label: 'Kimbie Dark', value: ETheme.KIMBIE_DARK },
			{ label: 'Light', value: ETheme.LIGHT },
			{ label: 'Min', value: ETheme.MIN },
			{ label: 'Monokai Pro', value: ETheme.MONOKAI_PRO },
			{ label: 'Nord', value: ETheme.NORD },
			{ label: 'Nord Light', value: ETheme.NORD_LIGHT },
			{ label: 'Obsidian', value: ETheme.OBSIDIAN },
			{ label: 'One Dark', value: ETheme.ONE_DARK },
			{ label: 'One Light', value: ETheme.ONE_LIGHT },
			{ label: 'Palenight', value: ETheme.PALENIGHT },
			{ label: "Rosé Pine", value: ETheme.ROSE_PINE },
			{ label: 'Solarized Dark', value: ETheme.SOLARIZED_DARK },
			{ label: 'Solarized Light', value: ETheme.SOLARIZED_LIGHT },
			{ label: 'Tokyo Night', value: ETheme.TOKYO_NIGHT },
			{ label: 'Tokyo Night Light', value: ETheme.TOKYO_NIGHT_LIGHT },
			{ label: 'Vesper', value: ETheme.VESPER },
		].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })),
		itemToString: (item) => item.label,
		itemToValue: (item) => item.value,
	});

	const dirtySetter = useCallback((fn: (val: any) => void, val: any) => {
		fn(val);
		setIsDirty(true);
	}, []);

	const saveMut = useMutation<Partial<ISettings>, ISettings>(
		useCallback((data: Partial<ISettings>) => updateSettings(data), [])
	);

	// Check actual OS autostart status (desktop app only) - this is the source of truth
	useEffect(() => {
		const checkOsAutoLaunch = async () => {
			const api = await getAutostartApi();
			if (!api) return; // Not running in Tauri

			try {
				const result = await api.isEnabled();
				setAutoLaunch(result);
			} catch (err) {
				console.error('[Settings] Failed to check autostart status:', err);
			}
		};
		checkOsAutoLaunch();
	}, []);

	// Check mic permission and enumerate devices
	useEffect(() => {
		const checkMicPermission = async () => {
			try {
				// Check permission state
				const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
				setMicPermissionGranted(permission.state === 'granted');

				permission.addEventListener('change', () => {
					setMicPermissionGranted(permission.state === 'granted');
					if (permission.state === 'granted') enumerateMicDevices();
				});
			} catch {
				// permissions.query not supported, try to enumerate
				enumerateMicDevices();
			}
		};

		const enumerateMicDevices = async () => {
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const audioInputs = devices
					.filter(d => d.kind === 'audioinput')
					.map(d => ({ id: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)` }));
				setMicDevices(audioInputs);
			} catch {
				setMicDevices([]);
			}
		};

		checkMicPermission();
	}, []);

	const handleGrantMicPermission = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			stream.getTracks().forEach(t => t.stop());
			setMicPermissionGranted(true);
			// Re-enumerate now that permission is granted
			const devices = await navigator.mediaDevices.enumerateDevices();
			const audioInputs = devices
				.filter(d => d.kind === 'audioinput')
				.map(d => ({ id: d.deviceId, label: d.label || `Microphone (${d.deviceId.slice(0, 8)}...)` }));
			setMicDevices(audioInputs);
			toast('success', 'Microphone access granted');
		} catch (err) {
			toast('error', 'Microphone access denied');
		}
	};

	const handleAddRoot = () => {
		const trimmed = newRoot.trim();
		if (trimmed && !modelRoots.includes(trimmed)) {
			dirtySetter(setModelRoots, [...modelRoots, trimmed]);
			dirtySetter(setNewRoot, '');
		}
	};

	const handleBrowseDirectory = async () => {
		if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
			try {
				const mod = await import('@tauri-apps/plugin-dialog');
				const path = await mod.open({ directory: true, multiple: false });
				if (path && !modelRoots.includes(path)) {
					dirtySetter(setNewRoot, path);
				}
			} catch (err) {
				console.error('[Settings] Failed to open directory picker:', err);
			}
		} else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
			try {
				const handle = await (window as any).showDirectoryPicker();
				if (handle) {
					dirtySetter(setNewRoot, handle.name);
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					console.error('[Settings] Failed to open directory picker:', err);
				}
			}
		} else {
			toast('error', 'Directory picker not supported in this browser. Please type the path manually.');
		}
	};

	const [deletingRootIndex, setDeletingRootIndex] = useState<number | null>(null);

	const handleRemoveRoot = (idx: number) => {
		dirtySetter(setModelRoots, modelRoots.filter((_, i) => i !== idx));
		dirtySetter(setDeletingRootIndex, null);
	};

	const confirmDeleteRoot = (idx: number) => {
		dirtySetter(setDeletingRootIndex, idx);
	};

const handleSave = async () => {
		const pendingRoot = newRoot.trim();
		if (pendingRoot && !modelRoots.includes(pendingRoot)) {
			dirtySetter(setModelRoots, [...modelRoots, pendingRoot]);
			dirtySetter(setNewRoot, '');
		}
		const pendingFsRoot = newFsRoot.trim();
		if (pendingFsRoot && !fsAllowedRoots.includes(pendingFsRoot)) {
			dirtySetter(setFsAllowedRoots, [...fsAllowedRoots, pendingFsRoot]);
			setNewFsRoot('');
		}

		const result = await saveMut.mutate({
			modelRoots,
			portRangeStart: portStart,
			portRangeEnd: portEnd,
			apiHost,
			apiPort,
			proxyEnabled,
			proxyPort,
				startMinimized,
			checkpointsPath,
			maxCheckpointDiskGB,
			disableTitleGen,
			theme: localTheme,
			micDeviceId,
			kokoroVoice,
			builtinMcpPort,
			builtinMcpExposeExternal,
			fsAllowedRoots,
		}); 

		if (saveMut.error) {
			toast('error', saveMut.error);
			return;
		}

		// Start/stop proxy if enabled state changed
		const oldProxyEnabled = settings?.proxyEnabled ?? false;
		if (proxyEnabled !== oldProxyEnabled) {
			if (proxyEnabled) {
				await startProxy();
			} else {
				await stopProxy();
			}
		}

		// Apply autostart setting via Tauri plugin (desktop only)
		const api = await getAutostartApi();
		if (api && autoLaunch !== null) {
			try {
				if (autoLaunch) {
					await api.enable();
				} else {
					await api.disable();
				}
				// Refresh the toggle to reflect actual OS status
				const isEnabled = await api.isEnabled();
				setAutoLaunch(isEnabled);
			} catch (err) {
				console.error('[Settings] Failed to apply autostart setting:', err);
				toast('error', `Failed to update autostart: ${String(err)}`);
			}
		}

		setIsDirty(false);
		toast('success', 'Settings saved');
	};

	return (
		<Box pb="80px">
				<PageHeader title="Settings" subtitle="WarpCore configuration" icon={<Settings size={20} />} />
				<Box pt="76px" px="4" pb="4">
		<VStack align="stretch" gap="6">
					{/* Theme */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Theme</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">UI appearance theme</Text>
							</Box>
							<Combobox.Root
								collection={themeCollection}
								value={[localTheme]}
								onValueChange={(details) => {
									dirtySetter(setLocalTheme, details.value?.[0] as ETheme);
								}}
							>
								<Combobox.Control>
									<Combobox.Trigger asChild>
										<Button
											variant="outline"
											size="sm"
											justifyContent="space-between"
											bg="var(--wc-bg-subtle)"
											borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)"
											fontSize="13px"
											borderRadius="lg"
											fontWeight="500"
										>
											{themeCollection.items.find(i => i.value === localTheme)?.label ?? 'Dark'}
											<ChevronDown size={14} />
										</Button>
									</Combobox.Trigger>
								</Combobox.Control>
								<Portal>
									<Combobox.Positioner>
										<Combobox.Content
											bg="var(--wc-bg-elevated)"
											borderWidth="1px"
											borderColor="var(--wc-border-default)"
											borderRadius="lg"
											shadow="0 8px 32px rgba(0, 0, 0, 0.5)"
											p="1"
										>
											{themeCollection.items.map((item) => (
												<Combobox.Item key={item.value} item={item} px="3" py="2" borderRadius="md" cursor="pointer" _hover={{ bg: 'var(--wc-bg-hover)' }} _highlighted={{ bg: 'var(--wc-bg-active)' }}>
													<Text fontSize="12px" color="var(--wc-text-primary)">{item.label}</Text>
													<Combobox.ItemIndicator />
												</Combobox.Item>
											))}
										</Combobox.Content>
									</Combobox.Positioner>
								</Portal>
							</Combobox.Root>
						</VStack>
					</Card>

					{/* Model directories */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Model Directories</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Folders to scan for GGUF models (user/model structure)</Text>
							</Box>

							<VStack align="stretch" gap="2">
								{modelRoots.map((root, idx) => (
									<HStack key={idx} gap="2">
										<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg="var(--wc-bg-surface)" flexShrink={0}>
											<FolderOpen size={14} color="var(--wc-text-secondary)" />
										</Flex>
										<Input
											value={root}
											readOnly
											size="sm"
											bg="var(--wc-bg-card)"
											borderColor="var(--wc-border-default)"
											color="var(--wc-text-primary)"
											fontFamily='"Geist Mono", monospace'
											fontSize="12px"
											borderRadius="lg"
										/>
										<Button size="sm" variant="ghost" color="var(--wc-text-faint)" _hover={{ color: 'var(--wc-accent-red-alt)', bg: 'var(--wc-accent-red-bg-12)' }} borderRadius="md" minW="8" px="0" onClick={() => confirmDeleteRoot(idx)}>
											<Trash2 size={14} />
										</Button>
									</HStack>
								))}

								<HStack gap="2">
									<Input
										placeholder="/path/to/models"
										size="sm"
										bg="var(--wc-bg-card)"
										borderColor="var(--wc-border-default)"
										color="var(--wc-text-primary)"
										fontFamily='"Geist Mono", monospace'
										fontSize="12px"
										borderRadius="lg"
										_placeholder={{ color: 'var(--wc-text-placeholder)' }}
										_focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }}
										value={newRoot}
										onChange={e => dirtySetter(setNewRoot, e.target.value)}
										onKeyDown={e => e.key === 'Enter' && handleAddRoot()}
									/>
									<Button size="sm" variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseDirectory} title="Browse directory">
										<FolderInput size={14} />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										color="var(--wc-text-secondary)"
										_hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-10)' }}
										borderRadius="lg"
										onClick={handleAddRoot}
										disabled={!newRoot.trim()}
									>
										<Plus size={14} />
									</Button>
								</HStack>
							</VStack>
						</VStack>
					</Card>

					{/* Port range */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Port Range</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Auto-assigned port range for llama-server instances</Text>
							</Box>
							<HStack gap="3">
								<Input value={portStart} onChange={e => dirtySetter(setPortStart, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
								<Text fontSize="13px" color="var(--wc-text-faint)">to</Text>
								<Input value={portEnd} onChange={e => dirtySetter(setPortEnd, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
							</HStack>
						</VStack>
					</Card>

					{/* Checkpoints */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Checkpoints</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">KV cache checkpoint storage. Leave path blank for default.</Text>
							</Box>
							<HStack gap="3">
								<Input value={checkpointsPath} onChange={e => dirtySetter(setCheckpointsPath, e.target.value)} size="sm" flex="1" placeholder="~/.config/warpcore/checkpoints/" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
							</HStack>
							<HStack gap="3">
								<Text fontSize="13px" color="var(--wc-text-secondary)">Max disk usage</Text>
								<Input value={maxCheckpointDiskGB} onChange={e => dirtySetter(setMaxCheckpointDiskGB, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
								<Text fontSize="13px" color="var(--wc-text-muted)">GB</Text>
							</HStack>
						</VStack>
					</Card>

					{/* Chat */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center" mb="2">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">Generate conversation titles</Text>
									<Text fontSize="12px" color="var(--wc-text-muted)">
										Use the loaded model to generate a concise title for new conversations. When disabled, titles are derived from your first message.
									</Text>
								</Box>
								<Switch.Root label='Generate titles' checked={!disableTitleGen} onCheckedChange={(details) => dirtySetter(setDisableTitleGen, !details.checked)}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: !disableTitleGen ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
										<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
									</Switch.Control>
									<Switch.Label ml="2" fontSize="13px" userSelect="none">
										Generate titles
									</Switch.Label>
								</Switch.Root>
							</HStack>
						</VStack>
					</Card>

					{/* Voice / STT */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Voice Input</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Microphone device for speech-to-text</Text>
							</Box>
							{!micPermissionGranted ? (
								<Button
									size="sm"
									bg="var(--wc-accent-blue-bg-15)"
									color="var(--wc-accent-blue)"
									_hover={{ bg: 'var(--wc-accent-blue-bg-25)' }}
									borderRadius="lg"
									leftIcon={<Mic size={15} />}
									onClick={handleGrantMicPermission}
								>
									Grant Microphone Access
								</Button>
							) : micDevices.length === 0 ? (
								<Text fontSize="12px" color="var(--wc-text-faint)">No microphone devices found</Text>
							) : (
								<NativeSelect.Root value={micDeviceId}>
									<NativeSelect.Field
										size="sm"
										bg="var(--wc-bg-card)"
										borderColor="var(--wc-border-default)"
										color="var(--wc-text-primary)"
										fontSize="13px"
										borderRadius="lg"
										onChange={(e) => dirtySetter(setMicDeviceId, e.target.value)}
									>
										<option value="">Default Microphone</option>
										{micDevices.map(d => (
											<option key={d.id} value={d.id}>{d.label}</option>
										))}
									</NativeSelect.Field>
								</NativeSelect.Root>
							)}
						</VStack>
					</Card>

					{/* Voice Output / TTS */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Voice Output</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Kokoro TTS voice for reading assistant messages</Text>
							</Box>
							<NativeSelect.Root value={kokoroVoice}>
								<NativeSelect.Field
									size="sm"
									bg="var(--wc-bg-card)"
									borderColor="var(--wc-border-default)"
									color="var(--wc-text-primary)"
									fontSize="13px"
									borderRadius="lg"
									onChange={(e) => dirtySetter(setKokoroVoice, e.target.value)}
								>
									<option value="af_heart">Heart (Female, US)</option>
									<option value="af_bella">Bella (Female, US)</option>
									<option value="af_nicole">Nicole (Female, US)</option>
									<option value="am_adam">Adam (Male, US)</option>
									<option value="am_michael">Michael (Male, US)</option>
									<option value="bf_emma">Emma (Female, UK)</option>
									<option value="bm_george">George (Male, UK)</option>
								</NativeSelect.Field>
							</NativeSelect.Root>
						</VStack>
					</Card>

					{/* API */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">API Host</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">WarpCore API listen address</Text>
							</Box>
							<HStack gap="3">
								<Input value={apiHost} onChange={e => dirtySetter(setApiHost, e.target.value)} size="sm" w="140px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
								<Text fontSize="13px" color="var(--wc-text-faint)">:</Text>
								<Input value={apiPort} onChange={e => dirtySetter(setApiPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
							</HStack>
						</VStack>
					</Card>
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Built-in MCP Server (warpmcp)</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Exposes built-in tools (file_read, file_write, dir_list, shell_exec, fetch) via MCP. Restarts on port or exposure change.</Text>
							</Box>
							<HStack gap="3">
								<Text fontSize="13px" color="var(--wc-text-muted)" w="100px">Port</Text>
								<Input value={builtinMcpPort} onChange={e => dirtySetter(setBuiltinMcpPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} />
							</HStack>
							<HStack gap="3">
								<Switch.Root label='Expose to external clients' checked={builtinMcpExposeExternal} onCheckedChange={(details) => dirtySetter(setBuiltinMcpExposeExternal, details.checked)}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: builtinMcpExposeExternal ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
										<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
									</Switch.Control>
									<Switch.Label ml="2" fontSize="13px" userSelect="none">
										Bind on 0.0.0.0 (off = loopback only)
									</Switch.Label>
								</Switch.Root>
							</HStack>
							<Box>
								<Text fontSize="13px" fontWeight="500" color="var(--wc-text-heading)" mb="1">File-system allowed roots</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)" mb="2">file_read, file_write, dir_list are disabled when empty. Paths checked after symlink resolution.</Text>
								<VStack align="stretch" gap="2">
									{fsAllowedRoots.map((root, idx) => (
										<HStack key={idx} gap="2">
											<Input value={root} readOnly size="sm" flex="1" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" />
											<Button size="sm" variant="ghost" onClick={() => dirtySetter(setFsAllowedRoots, fsAllowedRoots.filter((_, i) => i !== idx))}>
												<Trash2 size={14} />
											</Button>
										</HStack>
									))}
									<HStack gap="2">
										<Input value={newFsRoot} onChange={e => setNewFsRoot(e.target.value)} placeholder="/absolute/path" size="sm" flex="1" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" />
										<Button size="sm" variant="ghost" color="var(--wc-text-secondary)" _hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-hover-bg)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseFsRoot} title="Browse directory">
											<FolderOpen size={14} />
										</Button>
										<Button size="sm" variant="ghost" onClick={() => {
											const p = newFsRoot.trim();
											if (!p || fsAllowedRoots.includes(p)) return;
											dirtySetter(setFsAllowedRoots, [...fsAllowedRoots, p]);
											setNewFsRoot('');
										}}>
											<Plus size={14} />
										</Button>
									</HStack>
								</VStack>
							</Box>
						</VStack>
					</Card>

					{/* Proxy */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center" mb="2">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">Router</Text>
									<Text fontSize="12px" color="var(--wc-text-muted)">
										OpenAI-compatible proxy for routing requests by server alias
									</Text>
								</Box>
							</HStack>
							<HStack gap="3">
								<Switch.Root label='Start router on App launch' checked={proxyEnabled} onCheckedChange={(details) => dirtySetter(setProxyEnabled, details.checked)}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: proxyEnabled ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
										<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
									</Switch.Control>
									<Switch.Label ml="2" fontSize="13px" userSelect="none">
										Start router on App launch
									</Switch.Label>
								</Switch.Root>
								<Input value={proxyPort} onChange={e => dirtySetter(setProxyPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="var(--wc-bg-card)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} disabled={!proxyEnabled} />
							</HStack>
						</VStack>
					</Card>

					{/* Auto-launch */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">Launch on Startup</Text>
									<Text fontSize="12px" color="var(--wc-text-muted)">
										Start WarpCore automatically when you log in
									</Text>
									{autoLaunch === null && (
										<Text fontSize="11px" color="var(--wc-accent-red-alt)" mt="1">
											Desktop API not available - toggle disabled
										</Text>
									)}
								</Box>
								<Switch.Root checked={autoLaunch ?? false} onCheckedChange={(details) => dirtySetter(setAutoLaunch, details.checked)} disabled={autoLaunch === null}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: autoLaunch ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
										<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
									</Switch.Control>
								</Switch.Root>
							</HStack>
							{/* Start minimized */}
							<Box pt="2" borderTop="1px solid var(--wc-border-default)">
								<HStack justify="space-between" alignItems="center">
									<Box flex="1">
										<Text fontSize="13px" fontWeight="500" color="var(--wc-text-heading)">Start Minimized</Text>
										<Text fontSize="11px" color="var(--wc-text-muted)">
											Start to tray without showing window (requires Launch on Startup)
										</Text>
									</Box>
									<Switch.Root checked={startMinimized} onCheckedChange={(details) => dirtySetter(setStartMinimized, details.checked)} disabled={!autoLaunch || autoLaunch === null}>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: startMinimized ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
											<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
										</Switch.Control>
									</Switch.Root>
								</HStack>
							</Box>
						</VStack>
					</Card>

					{/* Onboarding */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)" mb="1">Onboarding</Text>
								<Text fontSize="12px" color="var(--wc-text-muted)">Re-run the setup guide</Text>
							</Box>
							<Button
								size="sm"
								variant="ghost"
								color="var(--wc-text-secondary)"
								_hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-10)' }}
								borderRadius="lg"
								leftIcon={<BookOpen size={15} />}
								onClick={() => updateSettings({ isOnboardingComplete: false })}
							>
								Re-run Onboarding
							</Button>
						</VStack>
					</Card>
				</VStack>
			</Box>

			{isDirty && (
				<Box
					position="fixed"
					bottom="0"
					left="0"
					right="0"
					bg="var(--wc-bg-page)"
					borderTopWidth="1px"
					borderColor="var(--wc-border-default)"
					p="4"
					zIndex={100}
				>
					<HStack justify="flex-end" gap="4">
						<Button
							size="sm"
							bg="var(--wc-accent-green-bg-15)"
							color="var(--wc-accent-green-icon)"
							borderWidth="1px"
							borderColor="var(--wc-accent-green-border)"
							_hover={{ bg: 'var(--wc-accent-green-hover)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="500"
							onClick={handleSave}
							disabled={saveMut.loading}
						>
							{saveMut.loading ? <Spinner size="xs" /> : <Save size={15} />}
							{'Save Changes'}
						</Button>
					</HStack>
				</Box>
			)}

			{deletingRootIndex !== null && (
				<ConfirmDialog
					title="Remove Model Directory?"
					message={`This will remove "${modelRoots[deletingRootIndex]}" from your configured model directories.`}
					isOpen={true}
					onCancel={() => setDeletingRootIndex(null)}
					onConfirm={() => handleRemoveRoot(deletingRootIndex)}
				/>
			)}
		</Box>
	);
}
