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
						<Text fontSize="11px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Server Name<Text as="span" color="var(--w-servers-launch-text-optional)" fontWeight="400">(optional)</Text></Text>
						<Input value={serverName} onChange={e => onServerNameChange(e.target.value)}
							placeholder={placeholder}
							bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)" color="var(--w-servers-launch-input-color)"
							fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--w-servers-launch-input-placeholder)' }}
							_focus={{ borderColor: 'var(--w-servers-launch-input-focus)', outline: 'none' }}
						/>
					</Box>
					<Box flex="2.5">
						<Text fontSize="11px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em" mb="1.5">Port <Text as="span" color="var(--w-servers-launch-text-optional)" fontWeight="400" textTransform="none">(0 = Auto)</Text></Text>
						<Input type="number" value={port} onChange={e => onPortChange(Number(e.target.value))} size="sm"
							bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)" color="var(--w-servers-launch-input-color)"
							fontFamily='"Geist Mono", monospace' fontSize="13px" borderRadius="lg"
							_focus={{ borderColor: 'var(--w-servers-launch-input-focus)', outline: 'none' }} min={0} max={65535}
						/>
					</Box>
				</Flex>
				<Text fontSize="11px" color="var(--w-servers-launch-text-label)" textTransform="uppercase" letterSpacing="0.05em">Proxy Aliases <Text as="span" color="var(--w-servers-launch-text-optional)" fontWeight="400">(optional)</Text></Text>
				<Input value={aliases} onChange={e => onAliasesChange(e.target.value)}
					placeholder="alias1, alias2, alias3"
					bg="var(--w-servers-launch-input-bg)" borderColor="var(--w-servers-launch-input-border)" color="var(--w-servers-launch-input-color)"
					fontSize="13px" borderRadius="lg" _placeholder={{ color: 'var(--w-servers-launch-input-placeholder)' }}
					_focus={{ borderColor: 'var(--w-servers-launch-input-focus)', outline: 'none' }}
				/>
				<Text fontSize="11px" color="var(--w-servers-launch-text-subtitle)">Comma-separated aliases, used for routing requests via proxy.</Text>
			</VStack>
		</Card>
	);
});
