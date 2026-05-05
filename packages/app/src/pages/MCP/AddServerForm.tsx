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
			borderColor="var(--wc-border-overlay)"
			borderRadius="md"
			bg="var(--wc-bg-surface)"
			mb="3"
		>
			<VStack gap="2" align="stretch">
				<Input
					placeholder="Server name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					size="sm"
					bg="var(--wc-bg-page)"
					borderColor="var(--wc-border-overlay)"
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
							bg={type === t ? 'var(--wc-bg-selected)' : 'transparent'}
							color={type === t ? 'var(--wc-text-heading)' : 'var(--wc-text-muted)'}
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
							bg="var(--wc-bg-page)"
							borderColor="var(--wc-border-overlay)"
							fontSize="13px"
						/>
						<Input
							placeholder="Arguments (space-separated)"
							value={args}
							onChange={(e) => setArgs(e.target.value)}
							size="sm"
							bg="var(--wc-bg-page)"
							borderColor="var(--wc-border-overlay)"
							fontSize="13px"
						/>
					</>
				) : (
					<Input
						placeholder="URL (e.g. https://example.com/mcp)"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						size="sm"
					bg="var(--wc-bg-page)"
							borderColor="var(--wc-border-overlay)"
						fontSize="13px"
					/>
				)}
				<HStack gap="2" justify="flex-end">
					<Box as="button" px="3" py="1" fontSize="12px" color="var(--wc-text-tertiary)" onClick={onCancel}>
						Cancel
					</Box>
					<Box
						as="button"
						px="3"
						py="1"
						fontSize="12px"
						borderRadius="sm"
						bg="var(--wc-bg-selected)"
						color="var(--wc-text-heading)"
						_hover={{ bg: 'var(--wc-bg-active)' }}
						onClick={handleSubmit}
					>
						Add
					</Box>
				</HStack>
			</VStack>
		</Box>
	);
}
