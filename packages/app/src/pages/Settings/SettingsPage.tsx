import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Switch } from '@chakra-ui/react';
import { Settings, FolderOpen, Plus, Trash2, Save, Check, FolderInput, BookOpen } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { useMutation } from '../../hooks/useQuery';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { updateSettings, startProxy, stopProxy } from '../../api/services';
import type { ISettings } from '@warpcore/shared';
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
				<Box p="4">
				<VStack align="stretch" gap="6">
					{/* Model directories */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="#e4e4e7" mb="1">Model Directories</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">Folders to scan for GGUF models (user/model structure)</Text>
							</Box>

							<VStack align="stretch" gap="2">
								{modelRoots.map((root, idx) => (
									<HStack key={idx} gap="2">
										<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)" flexShrink={0}>
											<FolderOpen size={14} color="rgba(255, 255, 255, 0.4)" />
										</Flex>
										<Input
											value={root}
											readOnly
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="rgba(255, 255, 255, 0.7)"
											fontFamily='"Geist Mono", monospace'
											fontSize="12px"
											borderRadius="lg"
										/>
										<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }} borderRadius="md" minW="8" px="0" onClick={() => confirmDeleteRoot(idx)}>
											<Trash2 size={14} />
										</Button>
									</HStack>
								))}

								<HStack gap="2">
									<Input
										placeholder="/path/to/models"
										size="sm"
										bg="rgba(255, 255, 255, 0.03)"
										borderColor="rgba(255, 255, 255, 0.08)"
										color="rgba(255, 255, 255, 0.7)"
										fontFamily='"Geist Mono", monospace'
										fontSize="12px"
										borderRadius="lg"
										_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
										_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
										value={newRoot}
										onChange={e => dirtySetter(setNewRoot, e.target.value)}
										onKeyDown={e => e.key === 'Enter' && handleAddRoot()}
									/>
									<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.08)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseDirectory} title="Browse directory">
										<FolderInput size={14} />
									</Button>
									<Button
										size="sm"
										variant="ghost"
										color="rgba(255, 255, 255, 0.4)"
										_hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }}
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
								<Text fontSize="14px" fontWeight="600" color="#e4e4e7" mb="1">Port Range</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">Auto-assigned port range for llama-server instances</Text>
							</Box>
							<HStack gap="3">
								<Input value={portStart} onChange={e => dirtySetter(setPortStart, Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">to</Text>
								<Input value={portEnd} onChange={e => dirtySetter(setPortEnd, Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
							</HStack>
						</VStack>
					</Card>

					{/* Checkpoints */}
					<Card>
						<VStack align="stretch" gap="4">
							<Box>
								<Text fontSize="14px" fontWeight="600" color="#e4e4e7" mb="1">Checkpoints</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">KV cache checkpoint storage. Leave path blank for default.</Text>
							</Box>
							<HStack gap="3">
								<Input value={checkpointsPath} onChange={e => dirtySetter(setCheckpointsPath, e.target.value)} size="sm" flex="1" placeholder="~/.config/warpcore/checkpoints/" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
							</HStack>
							<HStack gap="3">
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.5)">Max disk usage</Text>
								<Input value={maxCheckpointDiskGB} onChange={e => dirtySetter(setMaxCheckpointDiskGB, Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.4)">GB</Text>
							</HStack>
						</VStack>
					</Card>

					{/* Chat */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center" mb="2">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Generate conversation titles</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">
										Use the loaded model to generate a concise title for new conversations. When disabled, titles are derived from your first message.
									</Text>
								</Box>
								<Switch.Root label='Generate titles' checked={!disableTitleGen} onCheckedChange={(details) => dirtySetter(setDisableTitleGen, !details.checked)}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: !disableTitleGen ? '#3b86d6' : 'surface.4' }}>
										<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
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
								<Text fontSize="14px" fontWeight="600" color="#e4e4e7" mb="1">API Host</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">WarpCore API listen address</Text>
							</Box>
							<HStack gap="3">
								<Input value={apiHost} onChange={e => dirtySetter(setApiHost, e.target.value)} size="sm" w="140px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">:</Text>
								<Input value={apiPort} onChange={e => dirtySetter(setApiPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
							</HStack>
						</VStack>
					</Card>

					{/* Proxy */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center" mb="2">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Router</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">
										OpenAI-compatible proxy for routing requests by server alias
									</Text>
								</Box>
							</HStack>
							<HStack gap="3">
								<Switch.Root label='Start router on App launch' checked={proxyEnabled} onCheckedChange={(details) => dirtySetter(setProxyEnabled, details.checked)}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: proxyEnabled ? '#3b86d6' : 'rgba(255, 255, 255, 0.08)' }}>
										<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
									</Switch.Control>
									<Switch.Label ml="2" fontSize="13px" userSelect="none">
										Start router on App launch
									</Switch.Label>
								</Switch.Root>
								<Input value={proxyPort} onChange={e => dirtySetter(setProxyPort, Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} disabled={!proxyEnabled} />
							</HStack>
						</VStack>
					</Card>

					{/* Auto-launch */}
					<Card>
						<VStack align="stretch" gap="4">
							<HStack justify="space-between" alignItems="center">
								<Box flex="1">
									<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Launch on Startup</Text>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">
										Start WarpCore automatically when you log in
									</Text>
									{autoLaunch === null && (
										<Text fontSize="11px" color="#fb7185" mt="1">
											Desktop API not available - toggle disabled
										</Text>
									)}
								</Box>
								<Switch.Root checked={autoLaunch ?? false} onCheckedChange={(details) => dirtySetter(setAutoLaunch, details.checked)} disabled={autoLaunch === null}>
									<Switch.HiddenInput />
									<Switch.Control css={{ bg: autoLaunch ? '#3b86d6' : 'rgba(255, 255, 255, 0.08)' }}>
										<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
									</Switch.Control>
								</Switch.Root>
							</HStack>
							{/* Start minimized */}
							<Box pt="2" borderTop="1px solid rgba(255, 255, 255, 0.08)">
								<HStack justify="space-between" alignItems="center">
									<Box flex="1">
										<Text fontSize="13px" fontWeight="500" color="#e4e4e7">Start Minimized</Text>
										<Text fontSize="11px" color="rgba(255, 255, 255, 0.4)">
											Start to tray without showing window (requires Launch on Startup)
										</Text>
									</Box>
									<Switch.Root checked={startMinimized} onCheckedChange={(details) => dirtySetter(setStartMinimized, details.checked)} disabled={!autoLaunch || autoLaunch === null}>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: startMinimized ? '#3b86d6' : 'surface.4' }}>
											<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
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
								<Text fontSize="14px" fontWeight="600" color="#e4e4e7" mb="1">Onboarding</Text>
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">Re-run the setup guide</Text>
							</Box>
							<Button
								size="sm"
								variant="ghost"
								color="rgba(255, 255, 255, 0.5)"
								_hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }}
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
					bg="#101010"
					borderTopWidth="1px"
					borderColor="rgba(255, 255, 255, 0.08)"
					p="4"
					zIndex={100}
				>
					<HStack justify="flex-end" gap="4">
						<Button
							size="sm"
							bg="rgba(52, 211, 153, 0.12)"
							color="#34d399"
							borderWidth="1px"
							borderColor="rgba(52, 211, 153, 0.25)"
							_hover={{ bg: 'rgba(52, 211, 153, 0.2)' }}
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
