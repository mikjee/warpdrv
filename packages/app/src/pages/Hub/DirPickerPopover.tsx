import { Box, Text, VStack, HStack, Flex, Portal } from '@chakra-ui/react';
import { FolderOpen, Check } from 'lucide-react';

interface IDirPickerPopoverProps {
	roots: string[];
	existsInRoot: string | null; // if the file already exists in a root
	onSelect: (root: string) => void;
	onClose: () => void;
}

export function DirPickerPopover({ roots, existsInRoot, onSelect, onClose }: IDirPickerPopoverProps) {
	return (
		<Portal>
			<>
				{/* Backdrop */}
				<Box position="fixed" inset="0" zIndex="popover" onClick={onClose} />

				<Box
					position="fixed" left="50%" top="50%" transform="translate(-50%, -50%)"
					bg="var(--wc-bg-elevated)" borderWidth="1px" borderColor="var(--wc-border-overlay)"
					borderRadius="xl" shadow="0 12px 40px rgba(0, 0, 0, 0.5)"
					zIndex="popover" py="2" minW="320px"
				>
				<Text fontSize="11px" color="var(--wc-text-faint)" textTransform="uppercase" letterSpacing="0.05em" px="3" pb="2">
					Download to
				</Text>
				<VStack align="stretch" gap="0">
					{roots.map((root: string) => {
						const hasFiles = root === existsInRoot;
						return (
							<HStack
								key={root} gap="3" px="3" py="2.5" cursor="pointer"
								_hover={{ bg: 'var(--wc-bg-hover)' }}
								onClick={() => { onSelect(root); onClose(); }}
								transition="all 0.1s ease"
							>
								<Flex
									w="7" h="7" borderRadius="md" alignItems="center" justifyContent="center"
									bg={hasFiles ? 'var(--wc-accent-blue-bg-8)' : 'var(--wc-bg-card)'}
									flexShrink={0}
								>
									<FolderOpen size={14} color={hasFiles ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'} />
								</Flex>
								<Box flex="1" minW="0">
									<Text fontSize="12px" color="var(--wc-text-primary)" lineClamp={1} fontFamily='"Geist Mono", monospace'>
										{root}
									</Text>
									{hasFiles && (
										<HStack gap="1" mt="0.5">
											<Check size={10} color="var(--wc-accent-blue)" />
											<Text fontSize="10px" color="var(--wc-accent-blue)">Files from this repo already here</Text>
										</HStack>
									)}
								</Box>
							</HStack>
						);
					})}
				</VStack>
			</Box>
			</>
		</Portal>
	);
}
