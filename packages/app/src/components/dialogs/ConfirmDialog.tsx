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
				<Box position="fixed" inset="15px" borderRadius="12px" overflow="hidden" zIndex="modal">
					<Dialog.Backdrop position="absolute" />
					<Dialog.Positioner position="absolute">
						<Dialog.Content
							maxW="420px"
							bg="#0f0f12"
							borderColor="rgba(255, 255, 255, 0.08)"
							borderRadius="2xl"
							shadow="0 24px 80px rgba(0, 0, 0, 0.6)"
						>
						<VStack gap="4" px="6" py="5">
							<Box w="10" h="10" borderRadius="lg" display="flex" alignItems="center" justifyContent="center" bg="rgba(251, 113, 133, 0.12)">
								<AlertTriangle size={20} color="#fb7185" />
							</Box>

							<VStack gap="1.5">
								<Dialog.Title fontSize="16px" fontWeight="700" color="#e4e4e7">
									{title}
								</Dialog.Title>
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.5)" textAlign="center">
									{message}
								</Text>
							</VStack>

							<HStack gap="2" w="100%" pt="2">
								<Button
									flex="1"
									size="sm"
									variant="ghost"
									color="rgba(255, 255, 255, 0.4)"
									_hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }}
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
									bg="rgba(251, 113, 133, 0.12)"
									color="#fb7185"
									borderWidth="1px"
									borderColor="rgba(251, 113, 133, 0.25)"
									_hover={{ bg: 'rgba(251, 113, 133, 0.2)' }}
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
