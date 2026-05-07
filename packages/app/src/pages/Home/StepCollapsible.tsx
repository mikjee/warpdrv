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
			borderColor={isHighlighted ? 'var(--wc-accent-yellow-strong)' : 'var(--wc-border-subtle)'}
			borderRadius="xl"
			bg="var(--wc-bg-subtle)"
			overflow="hidden"
		>
			<Flex
				p="4"
				align="center"
				justify="space-between"
				cursor="pointer"
				onClick={() => setOpen(!open)}
				_hover={{ bg: 'var(--wc-bg-card)' }}
				transition="background 0.15s ease"
			>
				<HStack gap="3">
					{done
						? <CheckCircle2 size={18} color="var(--wc-accent-green-icon)" />
						: isHighlighted
							? <CircleDot size={18} color="var(--wc-accent-yellow-strong)" />
							: <Circle size={18} color="var(--wc-text-muted)" />
					}
					<Text fontSize="14px" fontWeight="500" color="var(--wc-text-primary)">
						{title}
					</Text>
				</HStack>
				<Box color="var(--wc-text-tertiary)">
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
