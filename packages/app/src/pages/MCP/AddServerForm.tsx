import React, { useState } from 'react';
import { Box, Text, HStack, VStack, Input } from '@chakra-ui/react';
import type { IMcpServerEntry } from '@warpcore/shared';

export function AddServerForm({ onAdd, onCancel }: { onAdd: (name: string, entry: IMcpServerEntry) => void; onCancel: () => void }) {
	const [name, setName] = useState('');
	const [type, setType] = useState<'stdio' | 'http'>('stdio');
	const [command, setCommand] = useState('');
	const [args, setArgs] = useState('');
	const [url, setUrl] = useState('');

	function handleSubmit() {
		if (!name.trim()) return;
		const entry: IMcpServerEntry = type === 'stdio'
			? { command: command.trim(), args: args.trim() ? args.split(/\s+/) : [] }
			: { url: url.trim() };
		onAdd(name.trim(), entry);
	}

	return (
		<Box
			p="3"
			borderWidth="1px"
			borderColor="rgba(255,255,255,0.1)"
			borderRadius="md"
			bg="rgba(255,255,255,0.02)"
			mb="3"
		>
			<VStack gap="2" align="stretch">
				<Input
					placeholder="Server name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					size="sm"
					bg="rgba(0,0,0,0.2)"
					borderColor="rgba(255,255,255,0.1)"
					fontSize="13px"
				/>
				<HStack gap="2">
					{(['stdio', 'http'] as const).map(t => (
						<Box
							key={t}
							as="button"
							px="3"
							py="1"
							fontSize="12px"
							borderRadius="sm"
							bg={type === t ? 'rgba(255,255,255,0.1)' : 'transparent'}
							color={type === t ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)'}
							onClick={() => setType(t)}
						>
							{t.toUpperCase()}
						</Box>
					))}
				</HStack>
				{type === 'stdio' ? (
					<>
						<Input
							placeholder="Command (e.g. npx, uvx, node)"
							value={command}
							onChange={(e) => setCommand(e.target.value)}
							size="sm"
							bg="rgba(0,0,0,0.2)"
							borderColor="rgba(255,255,255,0.1)"
							fontSize="13px"
						/>
						<Input
							placeholder="Arguments (space-separated)"
							value={args}
							onChange={(e) => setArgs(e.target.value)}
							size="sm"
							bg="rgba(0,0,0,0.2)"
							borderColor="rgba(255,255,255,0.1)"
							fontSize="13px"
						/>
					</>
				) : (
					<Input
						placeholder="URL (e.g. https://example.com/mcp)"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						size="sm"
						bg="rgba(0,0,0,0.2)"
						borderColor="rgba(255,255,255,0.1)"
						fontSize="13px"
					/>
				)}
				<HStack gap="2" justify="flex-end">
					<Box as="button" px="3" py="1" fontSize="12px" color="rgba(255,255,255,0.5)" onClick={onCancel}>
						Cancel
					</Box>
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="rgba(255,255,255,0.1)"
						color="rgba(255,255,255,0.8)"
						_hover={{ bg: 'rgba(255,255,255,0.15)' }}
						onClick={handleSubmit}
					>
						Add
					</Box>
				</HStack>
			</VStack>
		</Box>
	);
}
