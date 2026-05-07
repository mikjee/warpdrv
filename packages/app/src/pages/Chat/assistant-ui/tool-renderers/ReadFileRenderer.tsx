import React, { useState } from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { extractResultText } from './utils';

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
