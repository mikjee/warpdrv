import React from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { Globe } from 'lucide-react';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

export const FetchRenderer = React.memo((props: {
	url?: string,
	[key: string]: unknown
}) => {
	const { url, method, ...rest } = props;
	const extras = Object.entries(rest).filter(([, v]) => v !== undefined);

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center">
				<Globe size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">
					{url ?? '(no url)'}
				</Text>
			</HStack>
			<Text fontSize="10px" color="var(--wc-text-faint)" pt="1.5" pl="5">
				Method: <Text as="span" color="var(--wc-text-muted)">{(method as string)}</Text>
			</Text>
			{/* {extras.length > 0 && (
				<HStack gap="3" mt="1" pl="5" flexWrap="wrap">
					{extras.map(([k, v]) => (
						<Text key={k} fontSize="10px" color="var(--wc-text-faint)">
							{k}: <Text as="span" color="var(--wc-text-muted)">{String(v)}</Text>
						</Text>
					))}
				</HStack>
			)} */}
		</Box>
	);
});

export const FetchRendererMeta: IToolCallRenderer = {
	component: FetchRenderer,
	keywords: ['fetch', 'http', 'url', 'web', 'request', 'get', 'curl', 'download', 'navigate', 'scrape'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const url = args.url ?? args.uri ?? args.link ?? args.endpoint ?? args.address;
		if (typeof url !== 'string' || url.length === 0) return false;
		// Basic URL sanity check — must look url-ish
		if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return false;
		const { url: _u, uri: _i, link: _l, endpoint: _e, address: _a, ...rest } = args;
		return { url, ...rest };
	},
};