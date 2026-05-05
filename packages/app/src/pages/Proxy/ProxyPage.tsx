import { Box, Text, HStack, VStack, Flex, Button, Spinner, Badge, Switch } from '@chakra-ui/react';
import { Globe, Trash2, Server, ArrowRight, Play, Square, Shield } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useDependantState } from '../../hooks/useDependantState';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/dialogs/ConfirmDialog';
import { useMutation } from '../../hooks/useQuery';
import { useStore } from '../../store';
import { clearStickyRoute, clearAllStickyRoutes, startProxy, stopProxy, updateSettings } from '../../api/services';
import type { IProxyStatus, IStickyRouteInfo } from '../../api/services';
import type { ISettings } from '@warpcore/shared';
import { useToast } from '../../components/ToastProvider';
import { BsRouter } from 'react-icons/bs';
import { AccessTokensSection } from './AccessTokensSection';

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="2.5" py="1.5" borderRadius="lg" bg="var(--wc-bg-subtle)" borderWidth="1px" borderColor="var(--wc-bg-interactive)">
			<Box color="var(--wc-text-faint)">{icon}</Box>
			<Text fontSize="11px" color="var(--wc-text-muted)">{label}</Text>
			<Text fontSize="12px" fontWeight="600" color="var(--wc-text-secondary)" fontFamily='"Geist Mono", monospace'>{value}</Text>
		</HStack>
	);
}

function ProxyStatusBadge({ status }: { status: IProxyStatus }) {
	if (status.error) {
		return (
			<HStack
				gap="1.5"
				px="2.5"
				py="1"
				borderRadius="full"
				bg="var(--wc-accent-red-bg-8)"
				borderWidth="1px"
				borderColor="var(--wc-accent-red-border)"
			>
				<Box w="6px" h="6px" borderRadius="full" bg="var(--wc-accent-red)" shadow="0 0 8px var(--wc-accent-red)" />
				<Text fontSize="11px" fontWeight="600" color="var(--wc-accent-red)" letterSpacing="0.02em">
					Error: {status.error}
				</Text>
			</HStack>
		);
	}

	if (!status.running) {
		return (
			<HStack
				gap="1.5"
				px="2.5"
				py="1"
				borderRadius="full"
				bg="var(--wc-bg-subtle)"
				borderWidth="1px"
				borderColor="var(--wc-border-subtle)"
			>
				<Box w="6px" h="6px" borderRadius="full" bg="var(--wc-text-muted)" />
				<Text fontSize="11px" fontWeight="600" color="var(--wc-text-muted)" letterSpacing="0.02em">
					Stopped
				</Text>
			</HStack>
		);
	}

	return (
		<HStack
			gap="1.5"
			px="2.5"
			py="1"
			borderRadius="full"
bg="var(--wc-accent-green-bg-8)"
				borderWidth="1px"
				borderColor="var(--wc-accent-green-border)"
			>
				<Box w="6px" h="6px" borderRadius="full" bg="var(--wc-accent-green)" shadow="0 0 8px var(--wc-accent-green)" />
				<Text fontSize="11px" fontWeight="600" color="var(--wc-accent-green)" letterSpacing="0.02em">
				Running on port {status.port}
			</Text>
		</HStack>
	);
}

export function ProxyPage() {
	const proxyStatus = useStore((s) => s.proxyStatus);
	const proxyRoutes = useStore((s) => s.proxyRoutes);

	const [clearingAll, setClearingAll] = useState(false);
	const [restartConfirm, setRestartConfirm] = useState(false);
	const settings = useStore(s => s.settings);
	const [proxyAuthEnabled, setProxyAuthEnabled] = useDependantState(settings.proxyAuthEnabled);
	const [apiAuthEnabled, setApiAuthEnabled] = useDependantState(settings.apiAuthEnabled);
	const [authRequireForLocalhost, setAuthRequireForLocalhost] = useDependantState(settings.authRequireForLocalhost);

	const clearAllMut = useMutation<void, null>(useCallback(() => clearAllStickyRoutes(), []));
	const clearOneMut = useMutation<string, { cleared: boolean }>(useCallback((alias) => clearStickyRoute(alias), []));
	const startMut = useMutation<void, null>(useCallback(() => startProxy(), []));
	const stopMut = useMutation<void, null>(useCallback(() => stopProxy(), []));
	const saveSettingsMut = useMutation<Partial<ISettings>, ISettings>(
		useCallback((data: Partial<ISettings>) => updateSettings(data), [])
	);

	const handleClearAll = async () => {
		await clearAllMut.mutate();
		setClearingAll(false);
	};

	const handleClearOne = async (alias: string) => {
		await clearOneMut.mutate(alias);
	};

	const handleStart = async () => {
		await startMut.mutate(undefined);
	};

	const handleStop = async () => {
		await stopMut.mutate(undefined);
	};

	const handleProxyAuthToggle = async (details: { checked: boolean }) => {
		const checked = details.checked;
		if (checked && proxyStatus?.running) {
			setRestartConfirm(true);
		} else {
			setProxyAuthEnabled(checked);
			await saveSettingsMut.mutate({ proxyAuthEnabled: checked });
		}
	};

	const handleApiAuthToggle = async (details: { checked: boolean }) => {
		const checked = details.checked;
		setApiAuthEnabled(checked);
		await saveSettingsMut.mutate({ apiAuthEnabled: checked });
	};

	const handleAuthRequireForLocalhostToggle = async (details: { checked: boolean }) => {
		const checked = details.checked;
		setAuthRequireForLocalhost(checked);
		await saveSettingsMut.mutate({ authRequireForLocalhost: checked });
	};

	const handleRestartAndApply = async () => {
		await stopMut.mutate(undefined);
		await saveSettingsMut.mutate({ proxyAuthEnabled: true });
		await startMut.mutate(undefined);
		setProxyAuthEnabled(true);
		setRestartConfirm(false);
	};

	const getStatusSubtitle = (status: IProxyStatus, routeCount: number): string => {
		if (status.error) return 'Error';
		if (!status.running) return 'Stopped';
		return `${routeCount} sticky routes`;
	};

	const getIconBg = (status: IProxyStatus): string => {
		if (status.error) return 'var(--wc-accent-red-bg-8)';
		if (!status.running) return 'var(--wc-bg-card)';
		return 'var(--wc-accent-green-bg-8)';
	};

	const getIconBorder = (status: IProxyStatus): string => {
		if (status.error) return 'var(--wc-border-strong)';
		if (!status.running) return 'var(--wc-border-subtle)';
		return 'var(--wc-accent-green-border)';
	};

	const getIconColor = (status: IProxyStatus): string => {
		if (status.error) return 'var(--wc-accent-red)';
		if (!status.running) return 'var(--wc-text-faint)';
		return 'var(--wc-accent-green)';
	};

	return (
		<Box>
			<PageHeader
				title="Router"
				subtitle={proxyStatus ? getStatusSubtitle(proxyStatus, proxyRoutes.length) : '-'}
				icon={<BsRouter size={20} />}
				actions={
					proxyStatus?.enabled && proxyRoutes.length > 0 ? (
						<Button
							size="sm"
							variant="ghost"
							color="var(--wc-text-muted)"
							_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
							borderRadius="lg"
							fontSize="13px"
							fontWeight="600"
							onClick={() => setClearingAll(true)}
						>
							<Trash2 size={15} />
							Clear All
						</Button>
					) : null
				}
			/>
			<Box pt="76px" px="4" pb="4">
				<VStack align="stretch" gap="4">
					{/* Proxy Status Card */}
					<Card>
						<VStack align="stretch" gap="4">
							<Flex justify="space-between" align="start">
								<HStack gap="3">
									<Flex
										w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
										position="relative"
										bg={proxyStatus ? getIconBg(proxyStatus) : 'var(--wc-bg-card)'}
										borderWidth="1px"
										borderColor={proxyStatus ? getIconBorder(proxyStatus) : 'var(--wc-border-subtle)'}
									>
										<BsRouter size={18} color={proxyStatus ? getIconColor(proxyStatus) : 'var(--wc-text-faint)'} />
										{!proxyStatus?.error && proxyStatus?.running && proxyStatus?.healthy && <Box position="absolute" top="-1px" right="-1px" w="8px" h="8px" borderRadius="full" bg="var(--wc-accent-green)" shadow="0 0 8px var(--wc-accent-green)" />}
									</Flex>
									<Box>
										<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">Server Alias</Text>
										<HStack gap="3" mt="0.5">
											<ProxyStatusBadge status={proxyStatus ?? { enabled: false, port: 0, running: false, healthy: false, error: null }} />
										</HStack>
									</Box>
								</HStack>

								{!proxyStatus?.running ? (
									<Button
										size="sm"
bg="var(--wc-accent-blue-bg-12)"
						color="var(--wc-accent-blue)"
						borderWidth="1px"
						borderColor="var(--wc-accent-blue-border)"
						_hover={{ bg: 'var(--wc-accent-blue-hover-bg)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={handleStart}
										disabled={startMut.loading}
									>
										<Play size={14} />
										Start Router
									</Button>
								) : (
									<Button
										size="sm"
										variant="ghost"
color="var(--wc-text-muted)"
									_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
										borderRadius="lg"
										fontSize="13px"
										fontWeight="500"
										onClick={handleStop}
										disabled={stopMut.loading}
									>
										<Square size={14} />
										Stop Router
									</Button>
								)}
							</Flex>

							{/* Details row - simplified from server cards */}
							<HStack gap="2" flexWrap="wrap">
								<StatPill icon={<Server size={12} />} label="Port" value={`${proxyStatus?.port ?? '-'}`} />
								<StatPill icon={<Globe size={12} />} label="Routes" value={`${proxyRoutes.length}`} />
							</HStack>
						</VStack>
					</Card>

					{/* Auth Settings Section */}
					<Card>
						<VStack align="stretch" gap="3">
							<HStack gap="2" mb="2">
								<Shield size={14} color="var(--wc-text-tertiary)" />
								<Text fontSize="14px" fontWeight="600" color="var(--wc-text-primary)">Authentication</Text>
							</HStack>
							<VStack gap="2" align="stretch">
								<HStack justify="space-between" alignItems="center" px="3" py="2" borderRadius="lg" bg="var(--wc-bg-surface)">
									<Box flex="1">
										<Text fontSize="12px" fontWeight="500" color="var(--wc-text-secondary)">Proxy Auth</Text>
										<Text fontSize="10px" color="var(--wc-text-faint)">Require Bearer token for /v1/* endpoints</Text>
									</Box>
									<Switch.Root checked={proxyAuthEnabled} onCheckedChange={handleProxyAuthToggle}>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: proxyAuthEnabled ? 'var(--wc-switch-active)' : 'surface.4' }}>
											<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
										</Switch.Control>
									</Switch.Root>
								</HStack>
								<HStack justify="space-between" alignItems="center" px="3" py="2" borderRadius="lg" bg="var(--wc-bg-surface)">
									<Box flex="1">
										<Text fontSize="12px" fontWeight="500" color="var(--wc-text-secondary)">Control API Auth</Text>
										<Text fontSize="10px" color="var(--wc-text-faint)">Require auth for /api/* endpoints</Text>
									</Box>
									<Switch.Root checked={apiAuthEnabled} onCheckedChange={handleApiAuthToggle}>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: apiAuthEnabled ? 'var(--wc-switch-active)' : 'surface.4' }}>
											<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
										</Switch.Control>
									</Switch.Root>
								</HStack>
								<HStack justify="space-between" alignItems="center" px="3" py="2" borderRadius="lg" bg="var(--wc-bg-surface)">
									<Box flex="1">
										<Text fontSize="12px" fontWeight="500" color="var(--wc-text-secondary)">Require Auth for Localhost</Text>
										<Text fontSize="10px" color="var(--wc-text-faint)">Enforce auth even for localhost requests (testing)</Text>
									</Box>
									<Switch.Root checked={authRequireForLocalhost} onCheckedChange={handleAuthRequireForLocalhostToggle}>
										<Switch.HiddenInput />
										<Switch.Control css={{ bg: authRequireForLocalhost ? 'var(--wc-switch-active)' : 'surface.4' }}>
											<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
										</Switch.Control>
									</Switch.Root>
								</HStack>
							</VStack>
						</VStack>
					</Card>

					{/* Access Tokens Section */}
					<AccessTokensSection />

					{/* Routing Table Section */}
					<Card>
						<VStack align="stretch" gap="3">
							<Text fontSize="13px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">
								Sticky Routes
									</Text>

									{!proxyRoutes || proxyRoutes.length === 0 ? (
										<Flex
											h="120px" alignItems="center" justifyContent="center"
											borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="xl" borderStyle="dashed"
										>
											<VStack gap="2" color="var(--wc-text-faint)">
												<Text fontSize="13px">No sticky routes yet</Text>
												<Text fontSize="11px" color="var(--wc-text-muted)">Sticky routes are created when requests go through the router</Text>
											</VStack>
										</Flex>
									) : (
										<VStack align="stretch" gap="2">
											{proxyRoutes.map((route: IStickyRouteInfo) => (
												<Flex key={route.alias} justify="space-between" align="center" p="3" borderRadius="lg" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor="var(--wc-border-subtle)">
													<HStack gap="3">
														<Badge px="2" py="0.5" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-accent-blue-bg-10)" color="var(--wc-accent-blue)" borderWidth="1px" borderColor="var(--wc-accent-blue-border)">
															{route.alias}
														</Badge>
														<ArrowRight size={14} color="var(--wc-text-placeholder)" />
														<Text fontSize="12px" fontWeight="500" color="var(--wc-text-secondary)">
															{route.serverName ?? 'Unknown'}
														</Text>
													</HStack>
													<Button
														size="xs"
														variant="ghost"
color="var(--wc-text-faint)"
													_hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }}
														borderRadius="md"
														fontSize="11px"
														onClick={() => handleClearOne(route.alias)}
													>
														Clear
													</Button>
												</Flex>
											))}
										</VStack>
									)}
						</VStack>
					</Card>
				</VStack>
			</Box>

			{clearingAll && (
				<ConfirmDialog
					title="Clear All Sticky Routes?"
					message="This will remove all sticky route mappings. New routes will be created on the next request."
					isOpen={true}
					isLoading={clearAllMut.loading}
					onCancel={() => setClearingAll(false)}
					onConfirm={handleClearAll}
				/>
			)}

			{restartConfirm && (
				<ConfirmDialog
					title="Restart Proxy Required"
					message="Enabling proxy authentication requires restarting the proxy. This will terminate all existing connections. New connections will require authentication."
					isOpen={true}
					isLoading={stopMut.loading || startMut.loading || saveSettingsMut.loading}
					onCancel={() => { setRestartConfirm(false); setProxyAuthEnabled(false); }}
					onConfirm={handleRestartAndApply}
					confirmLabel="Restart"
				/>
			)}
		</Box>
	);
}
