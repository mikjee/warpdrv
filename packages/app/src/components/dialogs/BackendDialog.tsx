import { useState } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Badge, Textarea, Spinner,
} from '@chakra-ui/react';
import {
	X, Blocks, Terminal, FolderSearch, Plus, CheckCircle, AlertCircle,
} from 'lucide-react';
import { EValidationStatus } from '@warpcore/shared';
import { Card } from '../Card';
import { createBackend, updateBackend } from '../../api/services';
import { useToast } from '../ToastProvider';

const COMMON_FLAGS = [
	{ flag: '-ngl 999', label: 'Full GPU offload' },
	{ flag: '-fa 1', label: 'Flash Attention' },
	{ flag: '-dio', label: 'Direct I/O' },
	{ flag: '--no-warmup', label: 'Skip warmup' },
	{ flag: '--mlock', label: 'Lock memory' },
	{ flag: '--mmap', label: 'Memory map' },
];

interface IBackendDialogProps {
	onClose: () => void;
	editData?: { id: string; name: string; path: string; description: string; defaultArgs: string[] };
}

export function BackendDialog({ onClose, editData }: IBackendDialogProps) {
	const { toast } = useToast();
	const isEdit = !!editData;

	const [name, setName] = useState(editData?.name ?? '');
	const [path, setPath] = useState(editData?.path ?? '');
	const [description, setDescription] = useState(editData?.description ?? '');
	const [defaultArgs, setDefaultArgs] = useState<string[]>(editData?.defaultArgs ?? []);
	const [newArg, setNewArg] = useState('');
	const [saving, setSaving] = useState(false);

	const handleAddArg = () => {
		const trimmed = newArg.trim();
		if (trimmed && !defaultArgs.includes(trimmed)) {
			setDefaultArgs([...defaultArgs, trimmed]);
			setNewArg('');
		}
	};

	const handleRemoveArg = (idx: number) => {
		setDefaultArgs(defaultArgs.filter((_, i) => i !== idx));
	};

	const handleAddCommonFlag = (flag: string) => {
		const parts = flag.split(' ');
		const next = [...defaultArgs];
		for (const part of parts) if (!next.includes(part)) next.push(part);
		setDefaultArgs(next);
	};

	const handleSave = async () => {
		if (!name.trim() || !path.trim()) return;
		setSaving(true);

		const payload = { name: name.trim(), path: path.trim(), defaultArgs, description: description.trim() };

		const result = isEdit
			? await updateBackend(editData!.id, payload)
			: await createBackend(payload);

		setSaving(false);
		if (result.ok) {
			toast('success', isEdit ? `Backend "${name}" updated` : `Backend "${name}" added`);
			onClose();
		} else {
			toast('error', result.error ?? 'Failed to save backend');
		}
	};

	const canSave = name.trim() && path.trim() && !saving;

	return (
		<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
			<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={onClose} />

			<Box position="relative" w="580px" maxH="90vh" bg="#0f0f12" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(167, 139, 250, 0.1)" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.2)">
							<Blocks size={18} color="#a78bfa" />
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="#e4e4e7">{isEdit ? 'Edit Backend' : 'Add Backend'}</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)">Register a llama.cpp build</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<VStack align="stretch" gap="5">
						<Box>
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Name</Text>
							<Input placeholder="e.g. ROCm 7.2 — Strix Halo" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={name} onChange={e => setName(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Binary Path</Text>
							<Input placeholder="/path/to/llama-server" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={path} onChange={e => setPath(e.target.value)} />
							<Text fontSize="10px" color="rgba(255, 255, 255, 0.25)" mt="1">Binary is validated and devices are discovered when saved</Text>
						</Box>

						<Box>
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
							<Textarea placeholder="Notes about this backend..." size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontSize="12px" borderRadius="lg" rows={2} resize="none" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={description} onChange={e => setDescription(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Default Arguments</Text>
							<HStack gap="1.5" mb="3" flexWrap="wrap">
								{COMMON_FLAGS.map(({ flag, label }) => {
									const parts = flag.split(' ');
									const added = parts.every(p => defaultArgs.includes(p));
									return (
										<Button key={flag} size="xs" px="2.5" py="1" h="auto" borderRadius="md" fontSize="11px" fontWeight="400"
											bg={added ? 'rgba(52, 211, 153, 0.08)' : 'rgba(255, 255, 255, 0.03)'}
											color={added ? '#34d399' : 'rgba(255, 255, 255, 0.35)'}
											borderWidth="1px" borderColor={added ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.06)'}
											_hover={added ? {} : { bg: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.6)' }}
											onClick={() => !added && handleAddCommonFlag(flag)} cursor={added ? 'default' : 'pointer'}
										>
											{added && <CheckCircle size={10} />} {label}
										</Button>
									);
								})}
							</HStack>
							<HStack gap="1.5" flexWrap="wrap" mb="2">
								{defaultArgs.map((arg, i) => (
									<Badge key={i} px="2" py="1" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="rgba(255, 255, 255, 0.04)" color="rgba(255, 255, 255, 0.6)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" cursor="pointer" _hover={{ borderColor: 'rgba(251, 113, 133, 0.3)', color: '#fb7185' }} onClick={() => handleRemoveArg(i)} display="flex" alignItems="center" gap="1">
										{arg} <X size={10} />
									</Badge>
								))}
							</HStack>
							<HStack gap="2">
								<Input placeholder="--custom-flag" size="sm" bg="rgba(255, 255, 255, 0.03)" borderColor="rgba(255, 255, 255, 0.08)" color="rgba(255, 255, 255, 0.7)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }} _focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }} value={newArg} onChange={e => setNewArg(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddArg()} />
								<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#3381ff', bg: 'rgba(51, 129, 255, 0.08)' }} borderRadius="lg" onClick={handleAddArg} disabled={!newArg.trim()}>
									<Plus size={14} />
								</Button>
							</HStack>
						</Box>
					</VStack>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
					<Button size="sm" disabled={!canSave} bg="rgba(167, 139, 250, 0.15)" color="#a78bfa" borderWidth="1px" borderColor="rgba(167, 139, 250, 0.3)" _hover={{ bg: 'rgba(167, 139, 250, 0.25)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleSave}>
						{saving ? <Spinner size="xs" /> : <Blocks size={14} />}
						{isEdit ? 'Save Changes' : 'Add Backend'}
					</Button>
				</Flex>
			</Box>
		</Box>
	);
}
