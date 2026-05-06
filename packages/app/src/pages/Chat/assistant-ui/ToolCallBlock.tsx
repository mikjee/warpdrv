// ============================================================
// FILE: packages/app/src/pages/Chat/assistant-ui/ToolCallBlock.tsx
// Fallback body content for a tool call: collapsible args + result.
// Used when no custom renderer matches the tool.
// ============================================================
import React, { useState } from 'react';
import { Box, Text, HStack } from '@chakra-ui/react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface IToolCallBlockProps {
	args: string;
	result?: string;
}

function formatJson(jsonStr: string): string {
	try {
		return JSON.stringify(JSON.parse(jsonStr), null, 2);
	} catch {
		return jsonStr;
	}
}

export const ToolCallBlock = React.memo(({ args, result }: IToolCallBlockProps) => {
	const [argsExpanded, setArgsExpanded] = useState(false);
	const [resultExpanded, setResultExpanded] = useState(false);

	return (
		<>
			<Box px="3" py="1">
				<HStack gap="1" cursor="pointer" onClick={() => setArgsExpanded(!argsExpanded)} py="1">
					{argsExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
					<Text fontSize="11px" color="var(--wc-text-muted)">Arguments</Text>
				</HStack>
				{argsExpanded && (
					<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" mb="1" overflow="auto" maxH="200px">
						<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
							{formatJson(args)}
						</Text>
					</Box>
				)}
			</Box>
			{result && (
				<Box px="3" py="1">
					<HStack gap="1" cursor="pointer" onClick={() => setResultExpanded(!resultExpanded)} py="1">
						{resultExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
						<Text fontSize="11px" color="var(--wc-text-muted)">Result</Text>
					</HStack>
					{resultExpanded && (
						<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" mb="1" overflow="auto" maxH="300px">
							<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap">
								{formatJson(result)}
							</Text>
						</Box>
					)}
				</Box>
			)}
		</>
	);
});