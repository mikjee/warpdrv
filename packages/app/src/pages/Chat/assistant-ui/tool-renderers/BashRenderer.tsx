import React from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { Terminal } from 'lucide-react';
import { parse } from 'shell-quote';

const OPERATORS = new Set(['&&', '||', ';', '|', '&']);

function splitCommand(command: string): string[] {
	const parsed = parse(command);
	const groups: string[][] = [[]];
	for (const token of parsed) {
		if (typeof token === 'object' && token !== null && 'op' in token && OPERATORS.has(token.op)) {
			groups.push([]);
		} else if (typeof token === 'string') {
			groups[groups.length - 1].push(token);
		} else if (typeof token === 'object' && token !== null && 'op' in token) {
			groups[groups.length - 1].push(token.op);
		}
	}
	return groups
		.map(g => g.join(' ').trim())
		.filter(s => s.length > 0);
}

export const BashRenderer = React.memo((props: {
	command?: string,
	cwd?: string,
	shell?: string,
}) => {
	const { command, cwd, shell } = props;
	const subCommands = command ? splitCommand(command) : [];

	return (
		<Box px="3" py="2">
			<HStack gap="2" align="center" mb="2">
				<Terminal size={13} color="var(--wc-text-secondary)" />
				<Text fontSize="11px" color="var(--wc-text-faint)">
					{shell ?? 'shell'}
					{cwd && <Text as="span" color="var(--wc-text-muted)"> · {cwd}</Text>}
				</Text>
			</HStack>

			<Box bg="var(--wc-overlay-dim)" borderRadius="sm" p="2" mb="2" overflow="auto">
				<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" whiteSpace="pre-wrap" wordBreak="break-all">
					{command ?? '(no command)'}
				</Text>
			</Box>
			
			<VStack gap="1" align="stretch">
				{subCommands.map((sub, i) => (
					<HStack key={i} gap="2" align="flex-start">
						<Text fontSize="10px" color="var(--wc-text-faint)" minW="20px">{i + 1}.</Text>
						<Text fontSize="11px" fontFamily="mono" color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-all">
							{sub}
						</Text>
					</HStack>
				))}
			</VStack>
		</Box>
	);
});