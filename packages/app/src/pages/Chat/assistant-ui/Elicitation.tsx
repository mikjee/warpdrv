import React, { useState, useCallback } from 'react';
import { Box, Text, VStack, HStack, Input, Checkbox, NativeSelect } from '@chakra-ui/react';
import { ExternalLink } from 'lucide-react';
import { useStore } from '@/store';
import { respondToElicitation } from '@/api/elicitation';

interface IFieldSchema {
	type: 'string' | 'number' | 'integer' | 'boolean';
	enum?: string[];
	title?: string;
	description?: string;
	default?: unknown;
}

export const Elicitation = React.memo(() => {
	const currentThreadId = useStore(s => s.currentThreadId);
	const elicitation = useStore(s => currentThreadId ? s.elicitationByThread[currentThreadId] : undefined);
	const properties = (elicitation?.requestedSchema?.properties ?? {}) as Record<string, IFieldSchema>;
	const required = (elicitation?.requestedSchema?.required ?? []) as string[];
	const [values, setValues] = useState<Record<string, unknown>>({});
	const [submitting, setSubmitting] = useState(false);

	const setField = useCallback((key: string, value: unknown) => {
		setValues(prev => ({ ...prev, [key]: value }));
	}, []);

	const handleAction = useCallback(async (action: 'accept' | 'decline' | 'cancel') => {
		if (!elicitation) return;
		setSubmitting(true);
		try {
			if (action === 'accept') {
				const content: Record<string, unknown> = {};
				for (const [k, schema] of Object.entries(properties)) {
					const raw = values[k];
					if (schema.type === 'number' || schema.type === 'integer') {
						content[k] = raw === '' || raw === undefined ? undefined : Number(raw);
					} else if (schema.type === 'boolean') {
						content[k] = Boolean(raw);
					} else {
						content[k] = raw ?? '';
					}
				}
				await respondToElicitation(elicitation.id, { action, content });
			} else {
				await respondToElicitation(elicitation.id, { action });
			}
			setValues({});
		} catch (err) {
			console.error('Elicitation response failed:', err);
		} finally {
			setSubmitting(false);
		}
	}, [elicitation, values, properties]);

	if (!elicitation) return null;
	const isUrlMode = elicitation.mode === 'url' && elicitation.url;
	let host = '';
	if (isUrlMode && elicitation.url) {
		try { host = new URL(elicitation.url).host; } catch { host = elicitation.url; }
	}

	return (
		<Box borderWidth="1px" borderColor="var(--wc-border-default)" borderRadius="lg" bg="var(--wc-bg-surface)" p="3" maxH="320px" overflow="auto">
			<Text fontSize="11px" fontWeight="600" color="var(--wc-text-primary)" mb="1">{elicitation.serverName}</Text>
			<Text fontSize="12px" color="var(--wc-text-secondary)" mb="3">{elicitation.message}</Text>
			{isUrlMode && (
				<VStack gap="2" align="stretch" mb="3">
					<Text fontSize="11px" color="var(--wc-text-muted)">You will be sent to:</Text>
					<Text fontSize="12px" fontFamily="mono" color="var(--wc-text-primary)" wordBreak="break-all">{host}</Text>
					<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-blue-bg-15)" color="var(--wc-accent-blue)" disabled={submitting} onClick={() => { if (elicitation.url) window.open(elicitation.url, '_blank'); }}>
						<HStack gap="1"><ExternalLink size={12} /><Text fontSize="12px">Open in browser</Text></HStack>
					</Box>
				</VStack>
			)}
			{!isUrlMode && (
			<VStack gap="2" align="stretch" mb="3">
				{Object.entries(properties).map(([key, schema]) => {
					const isRequired = required.includes(key);
					const label = schema.title ?? key;
					return (
						<Box key={key}>
							<Text fontSize="11px" color="var(--wc-text-muted)" mb="1">
								{label}{isRequired && <Text as="span" color="var(--wc-accent-red)"> *</Text>}
							</Text>
							{schema.enum && schema.enum.length > 0 ? (
								<NativeSelect.Root size="sm">
									<NativeSelect.Field value={String(values[key] ?? schema.default ?? schema.enum[0])} onChange={(e) => setField(key, e.target.value)}>
										{schema.enum.map(opt => <option key={opt} value={opt}>{opt}</option>)}
									</NativeSelect.Field>
								</NativeSelect.Root>
							) : schema.type === 'boolean' ? (
								<Checkbox.Root checked={Boolean(values[key])} onCheckedChange={(d) => setField(key, d.checked)}>
									<Checkbox.Control />
									<Checkbox.Label fontSize="11px">{schema.description ?? ''}</Checkbox.Label>
								</Checkbox.Root>
							) : (
								<Input size="sm" type={schema.type === 'number' || schema.type === 'integer' ? 'number' : 'text'} value={String(values[key] ?? schema.default ?? '')} onChange={(e) => setField(key, e.target.value)} placeholder={schema.description ?? ''} />
							)}
						</Box>
					);
				})}
			</VStack>
			)}
			<HStack gap="2" justify="flex-end">
				<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-overlay-dim)" color="var(--wc-text-muted)" disabled={submitting} onClick={() => handleAction('cancel')}>Cancel</Box>
				<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-red-bg-12)" color="var(--wc-accent-red-alt)" disabled={submitting} onClick={() => handleAction('decline')}>Decline</Box>
				<Box as="button" px="3" py="1" fontSize="12px" borderRadius="sm" bg="var(--wc-accent-green-bg-15)" color="var(--wc-accent-green)" disabled={submitting} onClick={() => handleAction('accept')}>{isUrlMode ? 'Done' : 'Submit'}</Box>
			</HStack>
		</Box>
	);
});
