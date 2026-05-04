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
		<Box w="350px" px="3" py="2" borderRadius="lg" bg="var(--w-backends-groupcard-bg)" borderWidth="1px" borderColor="var(--w-backends-groupcard-border)">
			<VStack align="stretch" gap="3">
				<Flex justify="space-between" align="start">
					<Box>
						<HStack gap="2" mb="1">
							<Text fontSize="15px" fontWeight="600" color="var(--w-backends-groupcard-name)">{group.name}</Text>
							{group.description && (
								<Text fontSize="12px" color="var(--w-backends-groupcard-description)">{group.description}</Text>
							)}
						</HStack>
						<HStack gap="2">
							<HStack gap="1">
								<Text fontSize="12px" fontWeight="500" color="var(--w-backends-groupcard-active-backend)">{activeBackend?.name || 'Unknown'}</Text>
							</HStack>
						</HStack>
					</Box>
					<HStack gap="1">
						<Button size="xs" variant="ghost" color="var(--w-backends-groupcard-action-color)" _hover={{ color: 'var(--w-backends-groupcard-edit-hover)', bg: 'var(--w-backends-groupcard-edit-hover-bg)' }} borderRadius="md" onClick={() => onEdit?.(groupId)}>
							<Edit size={14} />
						</Button>
						<Button size="xs" variant="ghost" color="var(--w-backends-groupcard-action-color)" _hover={{ color: 'var(--w-backends-groupcard-delete-hover)', bg: 'var(--w-backends-groupcard-delete-hover-bg)' }} borderRadius="md" onClick={() => onDelete?.(groupId)}>
							<Trash2 size={14} />
						</Button>
					</HStack>
				</Flex>

				<Box>
					<Text fontSize="11px" color="var(--w-backends-groupcard-members-label)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Members ({memberBackends.length})</Text>
					<VStack align="stretch" gap="2">
						{memberBackends.map(backend => {
							const isActive = group.activeBackendId === backend.id;
							const isClickable = !isActive && memberBackends.length > 1;
							return (
								<HStack key={backend.id} px="3" py="2" borderRadius="md" bg={isActive ? 'var(--w-backends-groupcard-member-active-bg)' : 'var(--w-backends-groupcard-member-inactive-bg)'} borderWidth="1px" borderColor={isActive ? 'var(--w-backends-groupcard-member-active-border)' : 'var(--w-backends-groupcard-member-inactive-border)'} cursor={isClickable ? 'pointer' : 'default'} _hover={{ borderColor: isClickable ? 'var(--w-backends-groupcard-member-hover-border)' : undefined }} onClick={() => isClickable && onActivateBackend?.(groupId, backend.id)}>
									<Flex w="6" h="6" borderRadius="md" bg={isActive ? 'var(--w-backends-groupcard-member-icon-active-bg)' : 'var(--w-backends-groupcard-member-icon-inactive-bg)'} alignItems="center" justifyContent="center">
										<Blocks size={10} color={isActive ? 'var(--w-backends-groupcard-member-icon-active)' : 'var(--w-backends-groupcard-member-icon-inactive)'} />
									</Flex>
									<Box flex="1">
										<HStack justify="space-between">
											<Text fontSize="12px" color={isActive ? 'var(--w-backends-groupcard-member-name-active)' : 'var(--w-backends-groupcard-member-name-inactive)'} fontWeight={isActive ? '600' : '400'}>{backend.name}</Text>
											{isActive && (
												<HStack gap="1">
													<Text fontSize="10px" color="var(--w-backends-groupcard-active-label)" fontWeight="500">ACTIVE</Text>
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
