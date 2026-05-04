import { useState } from 'react';
import {
	Box, Text, HStack, VStack, Flex, Input, Button, Badge, Textarea, Spinner,
} from '@chakra-ui/react';
import {
	X, Blocks, Terminal, FolderSearch, Plus, CheckCircle, AlertCircle, FileInput,
} from 'lucide-react';
import { EValidationStatus, ALL_COMMON_FLAGS, TOGGLE_FLAG_MAPPINGS, getFlagMapping } from '@warpcore/shared';
import { Card } from '../../components/Card';
import { createBackend, updateBackend } from '../../api/services';
import { useToast } from '../../components/ToastProvider';
import { useStore } from '../../store';
import type { TBackendId } from '@warpcore/shared';

interface IBackendDialogProps {
	onClose: () => void;
	editBackendId?: TBackendId;
}

// Flags that take a numeric value (flag followed by its value)
const FLAG_VALUE_PAIRS: Record<string, RegExp> = {
	'-ngl': /^\d+$/,
	'-c': /^\d+$/,
	'-b': /^\d+$/,
	'-ub': /^\d+$/,
	'-t': /^\d+$/,
	'-tb': /^\d+$/,
	'-fa': /^\d+$/,
};

export function BackendDialog({ onClose, editBackendId }: IBackendDialogProps) {
	const { toast } = useToast();
	const backend = editBackendId ? useStore((s) => s.backends[editBackendId]) : undefined;
	const isEdit = !!backend;

	// Group related args for display (e.g., ["-ngl", "999"] -> [["-ngl", "999"]])
	const groupArgsForDisplay = (args: string[]) => {
		const grouped: string[][] = [];
		let i = 0;
		while (i < args.length) {
			const current = args[i] as string;
			const pattern = FLAG_VALUE_PAIRS[current];
			if (pattern && i + 1 < args.length && pattern.test(args[i + 1] as any)) {
				grouped.push([args[i] as any, args[i + 1]]);
				i += 2;
			} else {
				grouped.push([current]);
				i += 1;
			}
		}
		return grouped;
	};

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

	const handleToggleCommonFlag = (flag: string) => {
		const parts = flag.split(' ');
		const allPresent = parts.every(p => defaultArgs.includes(p));

		if (allPresent) {
			// Remove all parts of the flag
			const next = defaultArgs.filter(arg => !parts.includes(arg));
			setDefaultArgs(next);
		} else {
			// Add missing parts
			const next = [...defaultArgs];
			for (const part of parts) if (!next.includes(part)) next.push(part);
			setDefaultArgs(next);
		}
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
				console.error('[BackendDialog] Failed to open file picker:', err);
			}
		} else if (typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
			try {
				const [handle] = await (window as any).showOpenFilePicker();
				if (handle) {
					setPath(handle.name);
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					console.error('[BackendDialog] Failed to open file picker:', err);
				}
			}
		} else {
			toast('error', 'File picker not supported in this browser. Please type the path manually.');
		}
	};

	const handleSave = async () => {
		if (!name.trim() || !path.trim()) return;
		setSaving(true);

		const payload = { name: name.trim(), path: path.trim(), defaultArgs, description: description.trim() };

		const result = isEdit
			? await updateBackend(backend!.id, payload)
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
			<Box position="absolute" inset="0" bg="var(--w-backends-dialog-overlay)" backdropFilter="blur(8px)" onClick={onClose} />

			<Box position="relative" w="580px" maxH="90vh" bg="var(--w-backends-dialog-bg)" borderWidth="1px" borderColor="var(--w-backends-dialog-border)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--w-backends-dialog-header-border)" bg="var(--w-backends-dialog-header-bg)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="var(--w-backends-dialog-icon-bg)" borderWidth="1px" borderColor="var(--w-backends-dialog-icon-border)">
							<Blocks size={18} color="var(--w-backends-dialog-icon-color)" />
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="var(--w-backends-dialog-title)">{isEdit ? 'Edit Backend' : 'Add Backend'}</Text>
							<Text fontSize="12px" color="var(--w-backends-dialog-subtitle)">Register a llama.cpp build</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="var(--w-backends-dialog-close-color)" _hover={{ color: 'var(--w-backends-dialog-close-hover-color)', bg: 'var(--w-backends-dialog-close-hover-bg)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<VStack align="stretch" gap="5">
						<Box>
							<Text fontSize="11px" color="var(--w-backends-dialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Name</Text>
							<Input placeholder="e.g. ROCm 7.2 — Strix Halo" size="sm" bg="var(--w-backends-dialog-input-bg)" borderColor="var(--w-backends-dialog-input-border)" color="var(--w-backends-dialog-input-color)" fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--w-backends-dialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-dialog-input-focus)', outline: 'none' }} value={name} onChange={e => setName(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--w-backends-dialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Binary Path</Text>
							<HStack gap="2">
								<Input placeholder="/path/to/llama-server" size="sm" bg="var(--w-backends-dialog-input-bg)" borderColor="var(--w-backends-dialog-input-border)" color="var(--w-backends-dialog-input-color)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--w-backends-dialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-dialog-input-focus)', outline: 'none' }} value={path} onChange={e => setPath(e.target.value)} flex="1" />
								<Button size="sm" variant="ghost" color="var(--w-backends-dialog-browse-color)" _hover={{ color: 'var(--w-backends-dialog-browse-hover)', bg: 'var(--w-backends-dialog-browse-hover-bg)' }} borderRadius="lg" minW="8" px="0" onClick={handleBrowseFile} title="Browse file">
									<FileInput size={14} />
								</Button>
							</HStack>
							<Text fontSize="10px" color="var(--w-backends-dialog-hint)" mt="1">Binary is validated and devices are discovered when saved</Text>
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--w-backends-dialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Description (optional)</Text>
							<Textarea placeholder="Notes about this backend..." size="sm" bg="var(--w-backends-dialog-input-bg)" borderColor="var(--w-backends-dialog-input-border)" color="var(--w-backends-dialog-input-color)" fontSize="12px" borderRadius="lg" rows={2} resize="none" _placeholder={{ color: 'var(--w-backends-dialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-dialog-input-focus)', outline: 'none' }} value={description} onChange={e => setDescription(e.target.value)} />
						</Box>

						<Box>
							<Text fontSize="11px" color="var(--w-backends-dialog-label)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Default Arguments</Text>
							<HStack gap="1.5" mb="3" flexWrap="wrap">
								{ALL_COMMON_FLAGS.map(({ flag, label }) => {
									const parts = flag.split(' ');
									const added = parts.every(p => defaultArgs.includes(p));
									return (
										<Button key={flag} size="xs" px="2.5" py="1" h="auto" borderRadius="md" fontSize="11px" fontWeight="400"
											bg={added ? 'var(--w-backends-dialog-flag-added-bg)' : 'var(--w-backends-dialog-flag-inactive-bg)'}
											color={added ? 'var(--w-backends-dialog-flag-added-color)' : 'var(--w-backends-dialog-flag-inactive-color)'}
											borderWidth="1px" borderColor={added ? 'var(--w-backends-dialog-flag-added-border)' : 'var(--w-backends-dialog-flag-inactive-border)'}
											_hover={{ bg: added ? 'var(--w-backends-dialog-flag-added-hover-bg)' : 'var(--w-backends-dialog-flag-inactive-hover-bg)', color: added ? 'var(--w-backends-dialog-flag-added-hover-color)' : 'var(--w-backends-dialog-flag-inactive-hover-color)' }}
											onClick={() => handleToggleCommonFlag(flag)} cursor="pointer"
										>
											{added && <CheckCircle size={10} />} {label}
										</Button>
									);
								})}
							</HStack>
							<HStack gap="1.5" flexWrap="wrap" mb="2">
								{groupArgsForDisplay(defaultArgs).map((groupedArgs, gi) => (
									<Badge key={gi} px="2" py="1" borderRadius="md" fontSize="11px" fontFamily='"Geist Mono", monospace' bg="var(--w-backends-dialog-arg-badge-bg)" color="var(--w-backends-dialog-arg-badge-color)" borderWidth="1px" borderColor="var(--w-backends-dialog-arg-badge-border)" cursor="pointer" _hover={{ borderColor: 'var(--w-backends-dialog-arg-badge-hover-border)', color: 'var(--w-backends-dialog-arg-badge-hover-color)' }} onClick={() => {
										// Find the index of the first arg in this group and remove all args in the group
										const firstArg = groupedArgs[0];
										const firstIdx = defaultArgs.indexOf(firstArg as any);
										if (firstIdx !== -1) {
											const newArgs = [...defaultArgs];
											for (let j = 0; j < groupedArgs.length; j++) {
												const argIdx = newArgs.indexOf(groupedArgs[j] as any, firstIdx + j);
												if (argIdx !== -1) newArgs.splice(argIdx, 1);
											}
											setDefaultArgs(newArgs);
										}
									}} display="flex" alignItems="center" gap="1">
										{groupedArgs.join(' ')} <X size={10} />
									</Badge>
								))}
							</HStack>
							<HStack gap="2">
								<Input placeholder="--custom-flag" size="sm" bg="var(--w-backends-dialog-input-bg)" borderColor="var(--w-backends-dialog-input-border)" color="var(--w-backends-dialog-input-color)" fontFamily='"Geist Mono", monospace' fontSize="12px" borderRadius="lg" _placeholder={{ color: 'var(--w-backends-dialog-input-placeholder)' }} _focus={{ borderColor: 'var(--w-backends-dialog-input-focus)', outline: 'none' }} value={newArg} onChange={e => setNewArg(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddArg()} />
								<Button size="sm" variant="ghost" color="var(--w-backends-dialog-addarg-color)" _hover={{ color: 'var(--w-backends-dialog-addarg-hover-color)', bg: 'var(--w-backends-dialog-addarg-hover-bg)' }} borderRadius="lg" onClick={handleAddArg} disabled={!newArg.trim()}>
									<Plus size={14} />
								</Button>
							</HStack>
						</Box>
					</VStack>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="var(--w-backends-dialog-footer-border)" bg="var(--w-backends-dialog-footer-bg)">
					<Button size="sm" variant="ghost" color="var(--w-backends-dialog-cancel-color)" _hover={{ color: 'var(--w-backends-dialog-cancel-hover-color)', bg: 'var(--w-backends-dialog-cancel-hover-bg)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>Cancel</Button>
					<Button size="sm" disabled={!canSave} bg="var(--w-backends-dialog-save-bg)" color="var(--w-backends-dialog-save-color)" borderWidth="1px" borderColor="var(--w-backends-dialog-save-border)" _hover={{ bg: 'var(--w-backends-dialog-save-hover)' }} _disabled={{ opacity: 0.3, cursor: 'not-allowed' }} borderRadius="lg" fontSize="13px" fontWeight="600" px="5" onClick={handleSave}>
						{saving ? <Spinner size="xs" /> : <Blocks size={14} />}
						{isEdit ? 'Save Changes' : 'Add Backend'}
					</Button>
				</Flex>
			</Box>
		</Box>
	);
}
