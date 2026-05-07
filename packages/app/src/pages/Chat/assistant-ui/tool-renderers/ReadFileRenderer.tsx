import React, { useState } from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

export const ReadFileRenderer = React.memo((props: {
	path?: string,
	head?: number,
	tail?: number,
	offset?: number,
	length?: number,
	result?: unknown,
}) => {
	const { path, head, tail, offset, length, result } = props;
	const resultText = extractResultText(result);
	const [expanded, setExpanded] = useState(false);
	const rangeBits: string[] = [];
	if (head !== undefined) rangeBits.push(`head ${head}`);
	if (tail !== undefined) rangeBits.push(`tail ${tail}`);
	if (offset !== undefined) rangeBits.push(`offset ${offset}`);
	if (length !== undefined) rangeBits.push(`length ${length}`);
	const lineCount = resultText ? resultText.split('\n').length : 0;
	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center">
				<FileText size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">
					{path ?? '(no path)'}
				</Text>
				{rangeBits.length > 0 && (
					<Text fontSize="10px" color="var(--wc-text-faint)">
						{rangeBits.join(' · ')}
					</Text>
				)}
			</HStack>
			{resultText && (
				<Box mt="2">
					<HStack gap="1" cursor="pointer" onClick={() => setExpanded(!expanded)} py="1">
						{expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">Contents ({lineCount} lines)</Text>
					</HStack>
					{expanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" overflow="auto" maxH="400px">
							<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
								{resultText}
							</Text>
						</Box>
					)}
		</Box>
		)}
		</Box>
	);
});

export const ReadFileRendererMeta: IToolCallRenderer = {
	component: ReadFileRenderer,
	keywords: ['read', 'cat', 'view', 'open', 'get', 'fetch', 'load'],
	canRender: (args: Record<string, unknown>): TCanRenderResult => {
		const path = args.path ?? args.file_path ?? args.filepath ?? args.filename ?? args.file;
		if (typeof path !== 'string' || path.length === 0) return false;
		// Reject if it also looks like a write/edit (must NOT have content/old/edits)
		if (typeof args.content === 'string') return false;
		if (typeof args.old_string === 'string' || typeof args.new_string === 'string') return false;
		if (Array.isArray(args.edits)) return false;
		const head = typeof args.head === 'number' ? args.head : undefined;
		const tail = typeof args.tail === 'number' ? args.tail : undefined;
		const offset = typeof args.offset === 'number' ? args.offset : undefined;
		const length = typeof args.length === 'number' ? args.length : undefined;
		return { path, head, tail, offset, length };
	},
};
