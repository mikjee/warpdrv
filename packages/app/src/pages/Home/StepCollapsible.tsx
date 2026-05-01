import { Box, Text, HStack, Flex } from '@chakra-ui/react';
import { CheckCircle2, Circle, CircleDot, ChevronRight } from 'lucide-react';
import React from 'react';
import { useDependantState } from '@/hooks/useDependantState';
import { Collapsible } from '@chakra-ui/react';

export const StepCollapsible = React.memo(({
	title,
	done,
	isOpenDefault,
	isHighlighted,
	children,
}: {
	title: string;
	done: boolean;
	isOpenDefault: boolean;
	isHighlighted?: boolean;
	children: React.ReactNode;
}) => {
	const [open, setOpen] = useDependantState(isOpenDefault);

	return (
		<Box
			borderWidth="1px"
			borderColor={isHighlighted ? '#f59e0b' : 'rgba(255,255,255,0.06)'}
			borderRadius="xl"
			bg="rgba(255,255,255,0.015)"
			overflow="hidden"
		>
			<Flex
				p="4"
				align="center"
				justify="space-between"
				cursor="pointer"
				onClick={() => setOpen(!open)}
				_hover={{ bg: 'rgba(255,255,255,0.02)' }}
				transition="background 0.15s ease"
			>
				<HStack gap="3">
					{done
						? <CheckCircle2 size={18} color="#22c55e" />
						: isHighlighted
							? <CircleDot size={18} color="#f59e0b" />
							: <Circle size={18} color="rgba(255,255,255,0.25)" />
					}
					<Text fontSize="14px" fontWeight="500" color="rgba(255,255,255,0.8)">
						{title}
					</Text>
				</HStack>
				<Box color="rgba(255,255,255,0.3)">
					<ChevronRight size={16} transform={open ? 'rotate(90deg)' : 'rotate(0deg)'} transition="transform 0.15s ease" />
				</Box>
			</Flex>
			<Collapsible.Root open={open}>
				<Collapsible.Content>
					<Box px="4" pb="4" pt="1">
						{children}
					</Box>
				</Collapsible.Content>
			</Collapsible.Root>
		</Box>
	);
});
