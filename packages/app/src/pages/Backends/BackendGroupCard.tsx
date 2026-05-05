import { Box, Text, HStack, VStack, Flex, Button } from '@chakra-ui/react';
import { Blocks, Edit, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useStore } from '../../store';
import type { IBackend, IBackendGroup, TBackendId, TBackendGroupId } from '@warpcore/shared';

interface IBackendGroupCardProps {
	groupId: TBackendGroupId;
	onEdit?: (groupId: TBackendGroupId) => void;
	onDelete?: (groupId: TBackendGroupId) => void;
	onActivateBackend?: (groupId: TBackendGroupId, backendId: TBackendId) => void;
}

export function BackendGroupCard({ groupId, onEdit, onDelete, onActivateBackend }: IBackendGroupCardProps) {
	const group = useStore((s) => s.backendGroups[groupId]);
	const backends = useStore((s) => s.backends);

	const activeBackend = useMemo(() => {
		if (!group) return undefined;
		return backends[group.activeBackendId] ?? undefined;
	}, [group, backends]);

	const memberBackends = useMemo((): IBackend[] => {
		if (!group) return [];
		return group.backendIds
			.map(id => backends[id])
			.filter((b): b is IBackend => !!b);
	}, [group, backends]);

	if (!group) return null;

	return (
		<Box w="350px" px="3" py="2" borderRadius="lg" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor="var(--wc-border-subtle)">
			<VStack align="stretch" gap="3">
				<Flex justify="space-between" align="start">
					<Box>
						<HStack gap="2" mb="1">
							<Text fontSize="15px" fontWeight="600" color="var(--wc-text-primary)">{group.name}</Text>
							{group.description && (
								<Text fontSize="12px" color="var(--wc-text-muted)">{group.description}</Text>
							)}
						</HStack>
						<HStack gap="2">
							<HStack gap="1">
								<Text fontSize="12px" fontWeight="500" color="var(--wc-accent-purple)">{activeBackend?.name || 'Unknown'}</Text>
							</HStack>
						</HStack>
					</Box>
					<HStack gap="1">
						<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-purple)', bg: 'var(--wc-accent-purple-bg-8)' }} borderRadius="md" onClick={() => onEdit?.(groupId)}>
							<Edit size={14} />
						</Button>
						<Button size="xs" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-red)', bg: 'var(--wc-accent-red-bg-8)' }} borderRadius="md" onClick={() => onDelete?.(groupId)}>
							<Trash2 size={14} />
						</Button>
					</HStack>
				</Flex>

				<Box>
					<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Members ({memberBackends.length})</Text>
					<VStack align="stretch" gap="2">
						{memberBackends.map(backend => {
							const isActive = group.activeBackendId === backend.id;
							const isClickable = !isActive && memberBackends.length > 1;
							return (
								<HStack key={backend.id} px="3" py="2" borderRadius="md" bg={isActive ? 'var(--wc-accent-purple-bg-8)' : 'var(--wc-bg-surface)'} borderWidth="1px" borderColor={isActive ? 'var(--wc-accent-purple-border)' : 'var(--wc-border-subtle)'} cursor={isClickable ? 'pointer' : 'default'} _hover={{ borderColor: isClickable ? 'var(--wc-accent-purple-strong)' : undefined }} onClick={() => isClickable && onActivateBackend?.(groupId, backend.id)}>
									<Flex w="6" h="6" borderRadius="md" bg={isActive ? 'var(--wc-accent-purple-icon)' : 'var(--wc-bg-card)'} alignItems="center" justifyContent="center">
										<Blocks size={10} color={isActive ? 'var(--wc-accent-purple)' : 'var(--wc-text-muted)'} />
									</Flex>
									<Box flex="1">
										<HStack justify="space-between">
											<Text fontSize="12px" color={isActive ? 'var(--wc-text-primary)' : 'var(--wc-text-secondary)'} fontWeight={isActive ? '600' : '400'}>{backend.name}</Text>
											{isActive && (
												<HStack gap="1">
													<Text fontSize="10px" color="var(--wc-accent-purple)" fontWeight="500">ACTIVE</Text>
												</HStack>
											)}
										</HStack>
									</Box>
								</HStack>
							);
						})}
					</VStack>
				</Box>
			</VStack>
		</Box>
	);
}
