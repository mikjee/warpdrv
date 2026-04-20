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
			position={"sticky"}
			top="0"
			zIndex={"99"}
			justify="space-between"
			align="center"
			px="4"
			py="4"
			borderBottomWidth="1px"
			borderColor="rgba(255, 255, 255, 0.06)"
			bg="#0c0c0c"
		>
			<HStack gap="4">
				{icon && (
					<Flex
						w="10"
						h="10"
						borderRadius="xl"
						alignItems="center"
						justifyContent="center"
						// bg="rgba(51, 129, 255, 0.08)"
						// color="#3381ff"
						color={"#afafaf"}
						//borderWidth="1px"
						borderColor="rgba(51, 129, 255, 0.15)"
					>
						{icon}
					</Flex>
				)}
				<Box>
					<Text fontSize="16px" fontWeight="500" letterSpacing="-0.02em" color="#afafaf">
						{title}
					</Text>
					{subtitle && (
						<Text fontSize="12px" color="rgba(255, 255, 255, 0.4)">
							{subtitle}
						</Text>
					)}
				</Box>
			</HStack>
			{actions && <HStack gap="2">{actions}</HStack>}
		</Flex>
	);
}
