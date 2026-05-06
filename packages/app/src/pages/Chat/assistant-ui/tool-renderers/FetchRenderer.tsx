import React from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { Globe } from 'lucide-react';

export const FetchRenderer = React.memo((props: {
	url?: string,
	[key: string]: unknown
}) => {
	const { url, ...rest } = props;
	const extras = Object.entries(rest).filter(([, v]) => v !== undefined);

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center">
				<Globe size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">
					{url ?? '(no url)'}
				</Text>
			</HStack>
			{extras.length > 0 && (
				<HStack gap="3" mt="1" pl="5" flexWrap="wrap">
					{extras.map(([k, v]) => (
						<Text key={k} fontSize="10px" color="var(--wc-text-faint)">
							{k}: <Text as="span" color="var(--wc-text-muted)">{String(v)}</Text>
						</Text>
					))}
				</HStack>
			)}
		</Box>
	);
});