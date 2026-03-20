import { Box, Text, HStack, Flex } from '@chakra-ui/react';
import type { ReactNode } from 'react';

interface IPageHeaderProps {
	title: string;
	subtitle?: string;
	icon?: ReactNode;
	actions?: ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: IPageHeaderProps) {
	return (
		<Flex
			justify="space-between"
			align="center"
			px="8"
			py="6"
			borderBottomWidth="1px"
			borderColor="rgba(255, 255, 255, 0.06)"
			bg="rgba(255, 255, 255, 0.01)"
		>
			<HStack gap="3">
				{icon && (
					<Flex
						w="10"
						h="10"
						borderRadius="xl"
						alignItems="center"
						justifyContent="center"
						bg="rgba(51, 129, 255, 0.08)"
						color="#3381ff"
						borderWidth="1px"
						borderColor="rgba(51, 129, 255, 0.15)"
					>
						{icon}
					</Flex>
				)}
				<Box>
					<Text fontSize="20px" fontWeight="700" letterSpacing="-0.02em" color="#e4e4e7">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="13px" color="rgba(255, 255, 255, 0.4)" mt="0.5">
							{subtitle}
						</Text>
					)}
				</Box>
			</HStack>
			{actions && <HStack gap="2">{actions}</HStack>}
		</Flex>
	);
}
