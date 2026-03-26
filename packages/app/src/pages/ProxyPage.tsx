import { Box, Text, HStack, VStack, Flex, Button, Spinner, Badge } from '@chakra-ui/react';
import { Globe, Trash2, Server, ArrowRight, Play, Square } from 'lucide-react';
import { useState, useCallback } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/dialogs/ConfirmDialog';
import { useQuery, useListQuery, useMutation } from '../hooks/useQuery';
import { fetchProxyStatus, fetchStickyRoutes, clearStickyRoute, clearAllStickyRoutes, startProxy, stopProxy } from '../api/services';
import type { IProxyStatus, IStickyRouteInfo } from '../api/services';
import { useToast } from '../components/ToastProvider';
import { BsRouter } from 'react-icons/bs';

function StatPill({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
	return (
		<HStack gap="1.5" px="2.5" py="1.5" borderRadius="lg" bg="rgba(255, 255, 255, 0.03)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.05)">
			<Box color="rgba(255, 255, 255, 0.3)">{icon}</Box>
			<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)">{label}</Text>
			<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace'>{value}</Text>
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
				bg="color-mix(in srgb, #fb7185 10%, transparent)"
				borderWidth="1px"
				borderColor="color-mix(in srgb, #fb7185 20%, transparent)"
			>
				<Box w="6px" h="6px" borderRadius="full" bg="#fb7185" shadow="0 0 8px #fb7185" />
				<Text fontSize="11px" fontWeight="600" color="#fb7185" letterSpacing="0.02em">
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
				bg="rgba(255, 255, 255, 0.03)"
				borderWidth="1px"
				borderColor="rgba(255, 255, 255, 0.06)"
			>
				<Box w="6px" h="6px" borderRadius="full" bg="rgba(255, 255, 255, 0.4)" />
				<Text fontSize="11px" fontWeight="600" color="rgba(255, 255, 255, 0.4)" letterSpacing="0.02em">
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
			bg="color-mix(in srgb, #34d399 10%, transparent)"
			borderWidth="1px"
			borderColor="color-mix(in srgb, #34d399 20%, transparent)"
		>
			<Box w="6px" h="6px" borderRadius="full" bg="#34d399" shadow="0 0 8px #34d399" />
			<Text fontSize="11px" fontWeight="600" color="#34d399" letterSpacing="0.02em">
				Running on port {status.port}
			</Text>
		</HStack>
	);
}

export function ProxyPage() {
	const { toast } = useToast();
	const fetcher = useCallback(() => fetchProxyStatus(), []);
	const { data: status, loading, refetch } = useQuery<IProxyStatus>(fetcher, { pollInterval: 3000 });

	const routesFetcher = useCallback(() => fetchStickyRoutes(), []);
	const { data: routes, refetch: refetchRoutes } = useListQuery<IStickyRouteInfo>(routesFetcher, { pollInterval: 3000 });

	const [clearingAll, setClearingAll] = useState(false);
	const clearAllMut = useMutation<void, null>(useCallback(() => clearAllStickyRoutes(), []));
	const clearOneMut = useMutation<string, { cleared: boolean }>(useCallback((alias) => clearStickyRoute(alias), []));
	const startMut = useMutation<void, null>(useCallback(() => startProxy(), []));
	const stopMut = useMutation<void, null>(useCallback(() => stopProxy(), []));

	const handleClearAll = async () => {
		await clearAllMut.mutate();
		refetchRoutes();
		setClearingAll(false);
	};

	const handleClearOne = async (alias: string) => {
		await clearOneMut.mutate(alias);
		refetchRoutes();
	};

	const handleStart = async () => {
		await startMut.mutate(undefined);
		await refetch(); // let polling pick up the actual status
	};

	const handleStop = async () => {
		await stopMut.mutate(undefined);
		await refetch();
	};

	const getStatusSubtitle = (status: IProxyStatus, routeCount: number): string => {
		if (status.error) return 'Error';
		if (!status.running) return 'Stopped';
		return `${routeCount} sticky routes`;
	};

	const getIconBg = (status: IProxyStatus): string => {
		if (status.error) return 'rgba(251, 113, 133, 0.06)';
		if (!status.running) return 'rgba(255, 255, 255, 0.04)';
		return 'rgba(52, 211, 153, 0.06)';
	};

	const getIconBorder = (status: IProxyStatus): string => {
		if (status.error) return 'rgba(251, 113, 133, 0.15)';
		if (!status.running) return 'rgba(255, 255, 255, 0.06)';
		return 'rgba(52, 211, 153, 0.15)';
	};

	const getIconColor = (status: IProxyStatus): string => {
		if (status.error) return '#fb7185';
		if (!status.running) return 'rgba(255, 255, 255, 0.3)';
		return '#34d399';
	};

	return (
		<Box>
			<PageHeader
				title="Router"
				subtitle={status ? getStatusSubtitle(status, routes?.length ?? 0) : '-'}
				icon={<BsRouter size={20} />}
				actions={
					status?.enabled && routes?.length > 0 ? (
						<Button
							size="sm"
							variant="ghost"
							color="rgba(255, 255, 255, 0.4)"
							_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }}
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
			<Box p="8">
				<VStack align="stretch" gap="4">
					{/* Proxy Status Card */}
					<Card>
						<VStack align="stretch" gap="4">
							<Flex justify="space-between" align="start">
								<HStack gap="3">
									<Flex
										w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center"
										position="relative"
										bg={status ? getIconBg(status) : 'rgba(255, 255, 255, 0.04)'}
										borderWidth="1px"
										borderColor={status ? getIconBorder(status) : 'rgba(255, 255, 255, 0.06)'}
									>
										<BsRouter size={18} color={status ? getIconColor(status) : 'rgba(255, 255, 255, 0.3)'} />
										{!status?.error && status?.running && status?.healthy && <Box position="absolute" top="-1px" right="-1px" w="8px" h="8px" borderRadius="full" bg="#34d399" shadow="0 0 8px #34d399" />}
									</Flex>
									<Box>
										<Text fontSize="15px" fontWeight="600" color="#e4e4e7">Server Alias</Text>
										<HStack gap="3" mt="0.5">
											<ProxyStatusBadge status={status ?? { enabled: false, port: 0, running: false, healthy: false, error: null }} />
										</HStack>
									</Box>
								</HStack>

								{!status?.running ? (
									<Button
										size="sm"
										bg="rgba(51, 129, 255, 0.12)"
										color="#3381ff"
										borderWidth="1px"
										borderColor="rgba(51, 129, 255, 0.25)"
										_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
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
										color="rgba(255, 255, 255, 0.4)"
										_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }}
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
								<StatPill icon={<Server size={12} />} label="Port" value={`${status?.port ?? '-'}`} />
								<StatPill icon={<Globe size={12} />} label="Routes" value={`${routes?.length ?? 0}`} />
							</HStack>
						</VStack>
					</Card>

					{/* Routing Table Section */}
					<Card>
						<VStack align="stretch" gap="3">
							<Text fontSize="13px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">
								Sticky Routes
									</Text>

									{!routes || routes.length === 0 ? (
										<Flex
											h="120px" alignItems="center" justifyContent="center"
											borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" borderRadius="xl" borderStyle="dashed"
										>
											<VStack gap="2" color="rgba(255, 255, 255, 0.2)">
												<Text fontSize="13px">No sticky routes yet</Text>
												<Text fontSize="11px" color="rgba(255, 255, 255, 0.15)">Sticky routes are created when requests go through the router</Text>
											</VStack>
										</Flex>
									) : (
										<VStack align="stretch" gap="2">
											{routes.map(route => (
												<Flex key={route.alias} justify="space-between" align="center" p="3" borderRadius="lg" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.04)">
													<HStack gap="3">
														<Badge px="2" py="0.5" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(51, 129, 255, 0.1)" color="#3381ff" borderWidth="1px" borderColor="rgba(51, 129, 255, 0.2)">
															{route.alias}
														</Badge>
														<ArrowRight size={14} color="rgba(255, 255, 255, 0.2)" />
														<Text fontSize="12px" fontWeight="500" color="rgba(255, 255, 255, 0.7)">
															{route.serverName ?? 'Unknown'}
														</Text>
													</HStack>
													<Button
														size="xs"
														variant="ghost"
														color="rgba(255, 255, 255, 0.3)"
														_hover={{ color: '#fb7185', bg: 'rgba(251, 113, 133, 0.08)' }}
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
		</Box>
	);
}
