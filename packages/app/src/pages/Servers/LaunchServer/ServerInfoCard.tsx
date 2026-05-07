import React from 'react';
import { Flex, Box, Text, Input, VStack } from '@chakra-ui/react';
import { Card } from '@/components/Card';

export const ServerInfoCard = React.memo(({
	serverName,
	onServerNameChange,
	port,
	onPortChange,
	aliases,
	onAliasesChange,
	placeholder,
}: {
	serverName: string;
	onServerNameChange: (v: string) => void;
	port: number;
	onPortChange: (v: number) => void;
	aliases: string;
	onAliasesChange: (v: string) => void;
	placeholder: string;
}) => {
	return (
		<Card>
			<VStack align="stretch" gap="4">
				<Flex gap="4">
					<Box flex="7.5">
						<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Server Name<Text as="span" color="var(--wc-text-faint)" fontWeight="400">(optional)</Text></Text>
						<Input value={serverName} onChange={e => onServerNameChange(e.target.value)}
							placeholder={placeholder}
							bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
							fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }}
_focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }}
						/>
					</Box>
					<Box flex="2.5">
						<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Port <Text as="span" color="var(--wc-text-faint)" fontWeight="400" textTransform="none">(0 = Auto)</Text></Text>
						<Input type="number" value={port} onChange={e => onPortChange(Number(e.target.value))} size="sm"
							bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
							fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
							_focus={{ borderColor: 'var(--wc-accent-blue)', outline: 'none' }} min={0} max={65535}
						/>
					</Box>
				</Flex>
				<Text fontSize="11px" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Proxy Aliases <Text as="span" color="var(--wc-text-faint)" fontWeight="400">(optional)</Text></Text>
				<Input value={aliases} onChange={e => onAliasesChange(e.target.value)}
					placeholder="alias1, alias2, alias3"
					bg="var(--wc-bg-subtle)" borderColor="var(--wc-border-default)" color="var(--wc-text-primary)"
					fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--wc-text-faint)' }}
					_focus={{ borderColor: 'var(--wc-border-focus)', outline: 'none' }}
				/>
				<Text fontSize="11px" color="var(--wc-text-tertiary)">Comma-separated aliases, used for routing requests via proxy.</Text>
			</VStack>
		</Card>
	);
});
