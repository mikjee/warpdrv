import { Box, Text, VStack, HStack, Flex } from '@chakra-ui/react';
import { FolderOpen, Check } from 'lucide-react';

interface IDirPickerPopoverProps {
	roots: string[];
	existsInRoot: string | null; // if the file already exists in a root
	onSelect: (root: string) => void;
	onClose: () => void;
}

export function DirPickerPopover({ roots, existsInRoot, onSelect, onClose }: IDirPickerPopoverProps) {
	return (
		<>
			{/* Backdrop */}
			<Box position="fixed" inset="0" zIndex="popover" onClick={onClose} />

			<Box
				position="absolute" right="0" top="100%" mt="2"
				bg="#18181b" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.1)"
				borderRadius="xl" shadow="0 12px 40px rgba(0, 0, 0, 0.5)"
				zIndex="popover" py="2" minW="320px"
			>
				<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em" px="3" pb="2">
					Download to
				</Text>
				<VStack align="stretch" gap="0">
					{roots.map((root: string) => {
						const hasFiles = root === existsInRoot;
						return (
							<HStack
								key={root} gap="3" px="3" py="2.5" cursor="pointer"
								_hover={{ bg: 'rgba(255, 255, 255, 0.06)' }}
								onClick={() => { onSelect(root); onClose(); }}
								transition="all 0.1s ease"
							>
								<Flex
									w="7" h="7" borderRadius="md" alignItems="center" justifyContent="center"
									bg={hasFiles ? 'rgba(51, 129, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)'}
									flexShrink={0}
								>
									<FolderOpen size={14} color={hasFiles ? '#3381ff' : 'rgba(255, 255, 255, 0.35)'} />
								</Flex>
								<Box flex="1" minW="0">
									<Text fontSize="12px" color="#e4e4e7" lineClamp={1} fontFamily='"Geist Mono", monospace'>
										{root}
									</Text>
									{hasFiles && (
										<HStack gap="1" mt="0.5">
											<Check size={10} color="#3381ff" />
											<Text fontSize="10px" color="#3381ff">Files from this repo already here</Text>
										</HStack>
									)}
								</Box>
							</HStack>
						);
					})}
				</VStack>
			</Box>
		</>
	);
}
