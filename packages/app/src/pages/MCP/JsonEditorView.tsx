import { useState, useEffect } from 'react';
import { Box, VStack, Text, Textarea, HStack } from '@chakra-ui/react';
import type { IMcpConfigFile } from '@warpcore/shared';

export function JsonEditorView({ config, onSave }: { config: IMcpConfigFile; onSave: (config: IMcpConfigFile) => void }) {
	const [text, setText] = useState(JSON.stringify(config, null, '\t'));
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setText(JSON.stringify(config, null, '\t'));
	}, [config]);

	function handleSave() {
		try {
			const parsed = JSON.parse(text);
			if (!parsed.mcpServers) {
				setError('Missing "mcpServers" key');
				return;
			}
			setError(null);
			onSave(parsed);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Invalid JSON');
		}
	}

	return (
		<VStack gap="2" align="stretch" flex="1">
			<Textarea
				value={text}
				onChange={(e) => { setText(e.target.value); setError(null); }}
				fontFamily="mono"
				fontSize="12px"
				bg="var(--wc-bg-interactive)"
				borderColor="var(--wc-border-default)"
				color="var(--wc-text-heading)"
				flex="1"
				minH="300px"
				resize="vertical"
			/>
			{error && (
				<Text fontSize="11px" color="var(--wc-accent-red-alt)">{error}</Text>
			)}
			<HStack justify="flex-end">
				<Box
					as="button"
					px="3"
					py="1.5"
					fontSize="12px"
					borderRadius="sm"
					bg="var(--wc-bg-selected)"
					color="var(--wc-text-heading)"
					_hover={{ bg: 'var(--wc-bg-active)' }}
					onClick={handleSave}
				>
					Save & Reload
				</Box>
			</HStack>
		</VStack>
	);
}
