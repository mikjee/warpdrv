import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Switch, Combobox, createListCollection, Portal } from '@chakra-ui/react';
import { Settings, FolderOpen, Plus, Trash2, Save, ChevronDown, FolderInput, BookOpen } from 'lucide-react';
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
	const [newRoot, setNewRoot] = useState('');
	const [saved, setSaved] = useState(false);
	const [isDirty, setIsDirty] = useState(false);
	const [localTheme, setLocalTheme] = useDependantState(settings.theme ?? ETheme.DARK);
	const themeCollection = createListCollection({
		items: [
			{ label: 'Dark', value: ETheme.DARK },
			{ label: 'Light', value: ETheme.LIGHT },
			{ label: 'GitHub Dark', value: ETheme.GITHUB_DARK },
			{ label: 'GitHub Light', value: ETheme.GITHUB_LIGHT },
			{ label: 'One Dark', value: ETheme.ONE_DARK },
			{ label: 'One Light', value: ETheme.ONE_LIGHT },
			{ label: 'Dracula', value: ETheme.DRACULA_DARK },
			{ label: 'Dracula Light', value: ETheme.DRACULA_LIGHT },
			{ label: 'Catppuccin (Mocha)', value: ETheme.CATPPUCCIN_MOCHA },
			{ label: 'Catppuccin (Latte)', value: ETheme.CATPPUCCIN_LATTE },
			{ label: 'Nord', value: ETheme.NORD },
			{ label: 'Nord Light', value: ETheme.NORD_LIGHT },
			{ label: 'Tokyo Night', value: ETheme.TOKYO_NIGHT },
			{ label: 'Tokyo Night Light', value: ETheme.TOKYO_NIGHT_LIGHT },
			{ label: 'Amoled', value: ETheme.AMOLED },
			{ label: 'Vesper', value: ETheme.VESPER },
			{ label: 'Min', value: ETheme.MIN },
			{ label: 'Gruvbox Hard', value: ETheme.GRUVBOX_HARD },
			{ label: "Rosé Pine", value: ETheme.ROSE_PINE },
			{ label: 'Kanagawa', value: ETheme.KANAGAWA },
			{ label: 'Obsidian', value: ETheme.OBSIDIAN },
			{ label: 'Monokai Pro', value: ETheme.MONOKAI_PRO },
			{ label: 'Palenight', value: ETheme.PALENIGHT },
			{ label: 'Solarized Dark', value: ETheme.SOLARIZED_DARK },
			{ label: 'Gruvbox', value: ETheme.GRUVBOX },
			{ label: 'Kimbie Dark', value: ETheme.KIMBIE_DARK },
			{ label: 'Everforest Hard', value: ETheme.EVERFOREST_HARD },
			{ label: 'Solarized Light', value: ETheme.SOLARIZED_LIGHT },
		],
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
