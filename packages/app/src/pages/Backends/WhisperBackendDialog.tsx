import { useState } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Badge, Textarea, Spinner,
} from '@chakra-ui/react';
import {
	X, Mic, Plus, FileInput,
} from 'lucide-react';
import { createWhisperBackend, updateWhisperBackend } from '../../api/whisperServices';
import { useToast } from '../../components/ToastProvider';
import { useStore } from '../../store';
import type { TWhisperBackendId } from '@warpcore/shared';

interface IWhisperBackendDialogProps {
	onClose: () => void;
	editBackendId?: TWhisperBackendId;
}

export function WhisperBackendDialog({ onClose, editBackendId }: IWhisperBackendDialogProps) {
	const { toast } = useToast();
	const backend = editBackendId ? useStore((s) => s.whisperBackends[editBackendId]) : undefined;
	const isEdit = !!backend;

	const [name, setName] = useState(backend?.name ?? '');
	const [path, setPath] = useState(backend?.path ?? '');
	const [description, setDescription] = useState(backend?.description ?? '');
	const [defaultArgs, setDefaultArgs] = useState<string[]>(backend?.defaultArgs ?? []);
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

	const handleBrowseFile = async () => {
		if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
			try {
				const mod = await import('@tauri-apps/plugin-dialog');
				const filePath = await mod.open({ directory: false, multiple: false });
				if (filePath) {
					setPath(filePath);
				}
			} catch (err) {
				console.error('[WhisperBackendDialog] Failed to open file picker:', err);
			}
		} else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
			try {
				const [handle] = await (window as any).showOpenFilePicker();
				if (handle) {
					setPath(handle.name);
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					console.error('[WhisperBackendDialog] Failed to open file picker:', err);
				}
			}
		} else {
			toast('error', 'File picker not supported. Type the path manually.');
		}
	};

	const handleSave = async () => {
		if (!name.trim() || !path.trim()) {
			toast('error', 'Name and path are required');
			return;
		}
		setSaving(true);
		try {
			if (isEdit) {
				await updateWhisperBackend(editBackendId!, { name: name.trim(), path: path.trim(), description: description.trim(), defaultArgs });
				toast('success', 'Whisper backend updated');
			} else {
				await createWhisperBackend({ name: name.trim(), path: path.trim(), description: description.trim(), defaultArgs });
				toast('success', 'Whisper backend added');
			}
			onClose();
		} catch (err) {
			toast('error', String(err));
		} finally {
			setSaving(false);
		}
	};

	const canSave = name.trim() && path.trim() && !saving;

	return (
		<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
			<Box position="absolute" inset="0" bg="var(--wc-overlay-modal)" backdropFilter="blur(8px)" onClick={onClose} />

			<Box position="relative" w="580px" maxH="90vh" bg="var(--wc-bg-dialog)" borderWidth="1px" borderColor="var(--wc-border-default)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--wc-accent-green-bg-10)" borderWidth="1px" borderColor="var(--wc-accent-green-border)">
							<Mic size={18} color="var(--wc-accent-green)" />
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="var(--wc-text-primary)">{isEdit ? 'Edit Whisper Backend' : 'Add Whisper Backend'}</Text>
							<Text fontSize="12px" color="var(--wc-text-muted)">Register a whisper-server binary</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="var(--wc-text-faint)" _hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<VStack align="stretch" gap="5">
						<Box>
							<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Name</Text>
							<Input placeholder="e.g. whisper-cuda-12" size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-placeholder)' }} _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} value={name} onChange={e => setName(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Binary Path</Text>
							<HStack gap="2">
								<Input placeholder="/path/to/whisper-server" size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-placeholder)' }} _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} value={path} onChange={e => setPath(e.target.value)} flex="1" />
								<Button size="sm" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-green)', bg: 'var(--wc-accent-green-bg-8)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseFile} title="Browse file">
									<FileInput size={14} />
								</Button>
							</HStack>
							<Text fontSize="10px" color="var(--wc-text-disabled)" mt="1">Binary is validated when saved</Text>
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
							<Textarea placeholder="Notes about this backend..." size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)" fontSize="12px" borderRadius="lg" rows={2} resize="none" _placeholder={{ color: 'var(--wc-text-placeholder)' }} _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} value={description} onChange={e => setDescription(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Default Arguments</Text>
							<Text fontSize="10px" color="var(--wc-text-disabled)" mb="2">Applied to all servers using this backend</Text>
							<HStack gap="1.5" flexWrap="wrap" mb="2">
								{defaultArgs.map((arg, idx) => (
									<Badge key={idx} px="2" py="1" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--wc-bg-card)" color="var(--wc-text-secondary)" borderWidth="1px" borderColor="var(--wc-border-default)" cursor="pointer" _hover={{ borderColor: 'var(--wc-accent-red-hover)', color: 'var(--wc-accent-red)' }} onClick={() => handleRemoveArg(idx)} display="flex" alignItems="center" gap="1">
										{arg} <X size={10} />
									</Badge>
								))}
							</HStack>
							<HStack gap="2">
								<Input placeholder="--custom-flag" size="sm" bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-placeholder)' }} _focus={{ borderColor: 'var(--wc-accent-blue-focus)', outline: 'none' }} value={newArg} onChange={e => setNewArg(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddArg()} />
								<Button size="sm" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-accent-blue)', bg: 'var(--wc-accent-blue-bg-8)' }} borderRadius="lg" onClick={handleAddArg} disabled={!newArg.trim()}>
									<Plus size={14} />
								</Button>
							</HStack>
						</Box>
					</VStack>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" bg="var(--wc-bg-surface)">
					<Button size="sm" variant="ghost" color="var(--wc-text-muted)" _hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
					<Button size="sm" disabled={!canSave} bg="var(--wc-accent-green-bg-15)" color="var(--wc-accent-green)" borderWidth="1px" borderColor="var(--wc-accent-green-border)" _hover={{ bg: 'var(--wc-accent-green-hover-bg)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleSave}>
						{saving ? <Spinner size="xs" /> : <Mic size={14} />}
						{isEdit ? 'Save Changes' : 'Add Backend'}
					</Button>
				</Flex>
			</Box>
		</Box>
	);
}
