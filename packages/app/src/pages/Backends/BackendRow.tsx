import { Box, Text, HStack, VStack, Flex, Badge, Button, Spinner, Collapsible, SimpleGrid } from '@chakra-ui/react';
import { Blocks, CheckCircle, Trash2, Edit, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useStore } from '../../store';
import { DeviceCard } from './DeviceCard';
import { STATUS_COLORS } from './backendsUtils';
import { validateBackend } from '../../api/services';
import { useMutation } from '../../hooks/useQuery';
import type { IBackend, IDevice, TBackendId } from '@warpcore/shared';
import { EValidationStatus, EServerStatus } from '@warpcore/shared';

interface IBackendRowProps {
	backendId: TBackendId;
	onEdit?: (backendId: TBackendId) => void;
	onDelete?: (backendId: TBackendId) => void;
}

export function BackendRow({ backendId, onEdit, onDelete }: IBackendRowProps) {
	const backend = useStore((s) => s.backends[backendId]);
	const devices = useStore((s) => s.devices);
	const servers = useStore((s) => s.servers);
	const backendGroups = useStore((s) => s.backendGroups);

	const [expanded, setExpanded] = useState(false);

	const validateMut = useMutation<string, IBackend>(
		(id: string) => validateBackend(id)
	);

	const backendDevices = useMemo(() => {
		const fromStore = devices.filter(d => d.backendId === backendId);
		return fromStore.length > 0 ? fromStore : (backend?.detectedDevices ?? []);
	}, [devices, backendId, backend?.detectedDevices]);

	const deviceCount = backendDevices.length;

	const serverCounts = useMemo(() => {
		if (!backend) return { total: 0, running: 0 };
		let total = 0, running = 0;
		const serversArr = Object.values(servers);
		for (const server of serversArr) {
			let effectiveBackendId: string | null = null;
			if (server.backendId) {
				effectiveBackendId = server.backendId;
			} else if (server.backendGroupId) {
				const group = backendGroups[server.backendGroupId];
				if (group) {
					effectiveBackendId = group.activeBackendId;
				}
			}
			if (effectiveBackendId === backendId) {
				total++;
				if (server.status === EServerStatus.RUNNING) running++;
			}
		}
		return { total, running };
	}, [servers, backendGroups, backendId, backend]);

	const totalServerCount = serverCounts.total;
	const runningServerCount = serverCounts.running;

	if (!backend) return null;

	const statusColor = STATUS_COLORS[backend.validation] ?? 'rgba(255, 255, 255, 0.3)';
	const hasCollapsibleContent = deviceCount > 0;

	return (
		<Collapsible.Root open={expanded} onOpenChange={(o) => setExpanded(typeof o === 'boolean' ? o : o.open)}>
			<Box px="3" py="2" borderRadius="lg" bg="var(--w-backends-row-bg)" borderWidth="1px" borderColor="var(--w-backends-row-border)" cursor={hasCollapsibleContent ? 'pointer' : 'default'} _hover={{ borderColor: 'var(--w-backends-row-hover-border)' }} onClick={() => hasCollapsibleContent && setExpanded(prev => !prev)}>
				<VStack align="stretch" gap="3">
					<Flex justify="space-between" align="center">
						<HStack gap="3" flex="1">
							<Flex w="10" h="10" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--w-backends-row-icon-bg)">
								<Blocks size={20} color="var(--w-backends-row-icon-color)" />
							</Flex>
							<Box flex="1">
								<HStack gap="2" align="center">
									<Text fontSize="14px" fontWeight="600" color="var(--w-backends-row-name)">{backend.name}</Text>
									<HStack gap="1" color={statusColor}>
										{backend.validation === EValidationStatus.VALID ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
										<Text fontSize="11px" fontWeight="500">{backend.version || backend.validation}</Text>
									</HStack>
									{deviceCount > 0 && (
										<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--w-backends-row-device-badge-bg)" color="var(--w-backends-row-device-badge-color)" fontSize="10px" fontWeight="600">{deviceCount} Device(s)</Badge>
									)}
									{totalServerCount > 0 && (
										<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--w-backends-row-server-badge-bg)" color="var(--w-backends-row-server-badge-color)" fontSize="10px" fontWeight="600">{totalServerCount} Server(s)</Badge>
									)}
									{runningServerCount > 0 && (
										<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--w-backends-row-running-badge-bg)" color="var(--w-backends-row-running-badge-color)" border="1px solid var(--w-backends-row-running-badge-border)" fontSize="10px" fontWeight="600">{runningServerCount} Running</Badge>
									)}
								</HStack>
								<Text fontSize="12px" color="var(--w-backends-row-path)" fontFamily='"Geist Mono", monospace' lineClamp={1}>{backend.path}</Text>
							</Box>
						</HStack>
						<HStack gap="2">
							{hasCollapsibleContent && (
								<Box color="var(--w-backends-row-chevron)">
									{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
								</Box>
							)}
							<Button size="xs" variant="ghost" color="var(--w-backends-row-action-color)" _hover={{ color: 'var(--w-backends-row-edit-hover-color)', bg: 'var(--w-backends-row-edit-hover-bg)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); onEdit?.(backendId); }}>
								<Edit size={14} />
							</Button>
							<Button size="xs" variant="ghost" color="var(--w-backends-row-action-color)" _hover={{ color: 'var(--w-backends-row-refresh-hover-color)', bg: 'var(--w-backends-row-refresh-hover-bg)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); validateMut.mutate(backendId); }} disabled={validateMut.loading}>
								{validateMut.loading ? <Spinner size="xs" /> : <RefreshCw size={14} />}
							</Button>
							<Button size="xs" variant="ghost" color="var(--w-backends-row-action-color)" _hover={{ color: 'var(--w-backends-row-delete-hover-color)', bg: 'var(--w-backends-row-delete-hover-bg)' }} borderRadius="md" onClick={(e) => { e.stopPropagation(); onDelete?.(backendId); }}>
								<Trash2 size={14} />
							</Button>
						</HStack>
					</Flex>
				</VStack>
			</Box>
			<Collapsible.Content>
				<Box px="3" pb="3" pt="2" border={"1px solid var(--w-backends-row-collapse-border)"} borderTop={"none"} borderBottomRadius={"8px"} borderTopRadius={"0"}>
					{deviceCount === 0 ? (
						<Flex h="60px" alignItems="center" justifyContent="center">
							<Text fontSize="13px" color="var(--w-backends-row-collapse-empty)">No devices detected for this backend</Text>
						</Flex>
					) : (
						<SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} gap="3" mt="2">
							{backendDevices.map((device, idx) => (
								<DeviceCard key={`${device.id}-${idx}`} device={device} />
							))}
						</SimpleGrid>
					)}
				</Box>
			</Collapsible.Content>
		</Collapsible.Root>
	);
}
