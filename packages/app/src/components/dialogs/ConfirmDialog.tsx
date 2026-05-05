import { useState } from 'react';
import { Dialog, Portal, Box, Text, HStack, VStack, Button } from '@chakra-ui/react';
import { AlertTriangle } from 'lucide-react';

interface IConfirmDialogProps {
	title: string;
	message: string;
	isOpen: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	isLoading?: boolean;
	confirmLabel?: string;
	loadingLabel?: string;
}

export function ConfirmDialog({ title, message, isOpen, onConfirm, onCancel, isLoading = false, confirmLabel = 'Delete', loadingLabel }: IConfirmDialogProps) {
	const [open, setOpen] = useState(isOpen);

	return (
		<Dialog.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
			<Portal>
				<Box position="fixed" inset="6px" borderRadius="12px" overflow="hidden" zIndex="modal">
					<Dialog.Backdrop position="absolute" />
					<Dialog.Positioner position="absolute">
						<Dialog.Content
							maxW="420px"
							bg="var(--wc-bg-dialog)"
							borderColor="var(--wc-border-default)"
							borderRadius="2xl"
							shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
						>
						<VStack gap="4" px="6" py="5">
							<Box w="10" h="10" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="var(--wc-accent-red-bg-8)">
								<AlertTriangle size={20} color="var(--wc-accent-red)" />
							</Box>

							<VStack gap="1.5">
								<Dialog.Title fontSize="16px" fontWeight="700" color="var(--wc-text-heading)">
									{title}
								</Dialog.Title>
								<Text fontSize="13px" color="var(--wc-text-tertiary)" textAlign="center">
									{message}
								</Text>
							</VStack>

							<HStack gap="2" w="100%" pt="2">
								<Button
									flex="1"
									size="sm"
									variant="ghost"
									color="var(--wc-text-muted)"
									_hover={{ color: 'var(--wc-text-heading)', bg: 'var(--wc-bg-hover)' }}
									borderRadius="lg"
									fontSize="13px"
									onClick={onCancel}
									disabled={isLoading}
								>
									Cancel
								</Button>
								<Button
									flex="1"
									size="sm"
bg="var(--wc-accent-red-bg-8)"
								color="var(--wc-accent-red)"
								borderWidth="1px"
								borderColor="var(--wc-accent-red-border)"
								_hover={{ bg: 'var(--wc-accent-red-hover)' }}
									borderRadius="lg"
									fontSize="13px"
									fontWeight="500"
									onClick={() => { onConfirm(); setOpen(false); }}
									disabled={isLoading}
								>
									{isLoading ? (loadingLabel ?? `${confirmLabel}...`) : confirmLabel}
								</Button>
							</HStack>
						</VStack>
					</Dialog.Content>
					</Dialog.Positioner>
				</Box>
			</Portal>
		</Dialog.Root>
		);
}
