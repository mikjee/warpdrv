import { Box, Text, HStack, VStack, Flex, Input, Button, Spinner, Switch } from '@chakra-ui/react';
import { Settings, FolderOpen, Plus, Trash2, Save, Check, FolderInput } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { useQuery, useMutation } from '../hooks/useQuery';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { fetchSettings, updateSettings, startProxy, stopProxy } from '../api/services';
import type { ISettings } from '@warpcore/shared';
import { useToast } from '../components/ToastProvider';

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
	const fetcher = useCallback(() => fetchSettings(), []);
	const { data: settings, loading, refetch } = useQuery<ISettings>(fetcher);

	const [modelRoots, setModelRoots] = useState<string[]>([]);
	const [portStart, setPortStart] = useState(8085);
	const [portEnd, setPortEnd] = useState(8099);
	const [apiHost, setApiHost] = useState('0.0.0.0');
	const [apiPort, setApiPort] = useState(4400);
	const [proxyEnabled, setProxyEnabled] = useState(false);
	const [proxyPort, setProxyPort] = useState(1234);
	const [autoLaunch, setAutoLaunch] = useState<boolean | null>(null); // null = loading/not desktop, true/false = OS autostart status
	const [startMinimized, setStartMinimized] = useState(false);
	const [newRoot, setNewRoot] = useState('');
	const [saved, setSaved] = useState(false);

	const saveMut = useMutation<Partial<ISettings>, ISettings>(
		useCallback((data: Partial<ISettings>) => updateSettings(data), [])
	);

	// Sync local state from fetched settings (exclude autoLaunch - it comes from OS)
	useEffect(() => {
		if (settings) {
			setModelRoots(settings.modelRoots);
			setPortStart(settings.portRangeStart);
			setPortEnd(settings.portRangeEnd);
			setApiHost(settings.apiHost);
			setApiPort(settings.apiPort);
			setProxyEnabled(settings.proxyEnabled ?? false);
			setProxyPort(settings.proxyPort ?? 1234);
			setStartMinimized(settings.startMinimized ?? false);
		}
	}, [settings]);

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
			setModelRoots([...modelRoots, trimmed]);
			setNewRoot('');
		}
	};

	const handleBrowseDirectory = async () => {
		if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
			try {
				const mod = await import('@tauri-apps/plugin-dialog');
				const path = await mod.open({ directory: true, multiple: false });
				if (path && !modelRoots.includes(path)) {
					setNewRoot(path);
				}
			} catch (err) {
				console.error('[Settings] Failed to open directory picker:', err);
			}
		} else if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
			try {
				const handle = await (window as any).showDirectoryPicker();
				if (handle) {
					setNewRoot(handle.name);
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
		setModelRoots(modelRoots.filter((_, i) => i !== idx));
		setDeletingRootIndex(null);
	};

	const confirmDeleteRoot = (idx: number) => {
		setDeletingRootIndex(idx);
	};

	const handleSave = async () => {
		// Auto-add any text in the new root input before saving
		const pendingRoot = newRoot.trim();
		if (pendingRoot && !modelRoots.includes(pendingRoot)) {
			setModelRoots([...modelRoots, pendingRoot]);
			setNewRoot('');
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

		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		await refetch();
	};

	if (loading && !settings) {
		return (
			<Box>
				<PageHeader title="Settings" subtitle="WarpCore configuration" icon={<Settings size={20} />} />
				<Flex h="200px" alignItems="center" justifyContent="center">
					<Spinner size="lg" color="rgba(255, 255, 255, 0.2)" />
				</Flex>
			</Box>
		);
	}

	return (
		<Box>
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
										onChange={e => setNewRoot(e.target.value)}
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
								<Input value={portStart} onChange={e => setPortStart(Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">to</Text>
								<Input value={portEnd} onChange={e => setPortEnd(Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
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
								<Input value={apiHost} onChange={e => setApiHost(e.target.value)} size="sm" w="140px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.25)">:</Text>
								<Input value={apiPort} onChange={e => setApiPort(Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} />
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
								<Switch.Root label='Start router on App launch' checked={proxyEnabled} onCheckedChange={(details) => setProxyEnabled(details.checked)} color={proxyEnabled ? '#34d399' : 'rgba(255, 255, 255, 0.4)'}>
									<Switch.HiddenInput />
									<Switch.Control />
									<Switch.Label ml="2" fontSize="13px" color={proxyEnabled ? '#34d399' : 'rgba(255, 255, 255, 0.4)'} userSelect="none">
										Start router on App launch
									</Switch.Label>
								</Switch.Root>
								<Input value={proxyPort} onChange={e => setProxyPort(Number(e.target.value))} type="number" size="sm" w="100px" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg" textAlign="center" _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} disabled={!proxyEnabled} />
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
								<Switch.Root checked={autoLaunch ?? false} onCheckedChange={(details) => setAutoLaunch(details.checked)} disabled={autoLaunch === null}>
									<Switch.HiddenInput />
									<Switch.Control />
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
									<Switch.Root checked={startMinimized} onCheckedChange={(details) => setStartMinimized(details.checked)} disabled={!autoLaunch || autoLaunch === null}>
										<Switch.HiddenInput />
										<Switch.Control />
									</Switch.Root>
								</HStack>
							</Box>
						</VStack>
					</Card>
				</VStack>

				{/* Save button */}
				<HStack justify="flex-end" mt="2">
					<Button
						size="sm"
						bg={saved ? 'rgba(52, 211, 153, 0.12)' : 'rgba(52, 211, 153, 0.12)'}
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
						{saved ? <Check size={15} /> : saveMut.loading ? <Spinner size="xs" /> : <Save size={15} />}
						{saved ? 'Saved' : 'Save Changes'}
					</Button>
				</HStack>
			</Box>

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
