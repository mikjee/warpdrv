import React, { useState, useRef } from 'react';
import { Box, HStack, VStack, Text, Button, Switch, Textarea } from '@chakra-ui/react';
import { Pencil, Check } from 'lucide-react';
import { type IModel } from '@warpcore/shared';
import { Card } from '@/components/Card';

export const RecommendedParamsCard = React.memo(({
	useRecommended,
	onUseRecommendedChange,
	selectedEntry,
	onSave,
}: {
	useRecommended: boolean;
	onUseRecommendedChange: (v: boolean) => void;
	selectedEntry: { model: IModel } | null;
	onSave: (modelId: string, text: string) => Promise<void>;
}) => {
	const originalText = selectedEntry?.model.recommendedInferenceParams ?? '';
	const [isEditing, setIsEditing] = useState(false);
	const [draftText, setDraftText] = useState(originalText);
	const originalTextRef = useRef(originalText);

	// Sync when model changes
	if (originalTextRef.current !== originalText) {
		originalTextRef.current = originalText;
		setDraftText(originalText);
		setIsEditing(false);
	}

	const handleSave = async () => {
		if (!selectedEntry) return;
		await onSave(selectedEntry.model.id, draftText.trim());
		setIsEditing(false);
	};

	const handleCancel = () => {
		setDraftText(originalTextRef.current);
		setIsEditing(false);
	};

	const handleEdit = () => {
		originalTextRef.current = draftText;
		setIsEditing(true);
	};

	return (
		<Card>
			<VStack align="stretch" gap="3">
				<HStack justify="space-between" align="center">
					<VStack align="start" gap="0.5">
<Text fontSize="12px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em">Model Params</Text>
					<Text fontSize="11px" color="var(--wc-text-tertiary)">These params will apply to all servers that use this Model.</Text>
					</VStack>
					<Switch.Root label="Use recommended params" checked={useRecommended} onCheckedChange={(d) => onUseRecommendedChange(d.checked)} color={useRecommended ? 'var(--wc-accent-blue)' : 'var(--wc-text-tertiary)'}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: useRecommended ? 'var(--wc-accent-blue)' : 'surface.4' }}>
							<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
				{useRecommended && (
					<Box position="relative">
						<Textarea value={draftText} variant="subtle"
							bg={isEditing ? "var(--wc-bg-subtle)" : "transparent"} outline="none"
							onChange={(e) => setDraftText(e.target.value)}
							readOnly={!isEditing} opacity={isEditing ? 1 : 0.5}
							fontFamily="monospace" fontSize="12px"
							border={!isEditing ? "1px solid rgb(40,40,40)" : "auto"}
							cursor={isEditing ? "auto" : "default"}
							style={{ caretColor: isEditing ? "auto" : "transparent" }}
							resize="vertical" minH="100px" borderRadius="lg"
							placeholder="No recommended params available for this model"
						/>
						<HStack position="absolute" bottom="2" right="2" gap="2">
							{isEditing && (
								<Button size="xs" variant="ghost" color="var(--wc-text-secondary)"
									_hover={{ color: 'var(--wc-accent-red-alt)', bg: 'var(--wc-accent-red-bg-12)' }} borderRadius="md" fontSize="10px"
									onClick={handleCancel}>Cancel</Button>
							)}
							<Button size="xs" variant="outline" borderColor="var(--wc-border-default)" color="var(--wc-text-secondary)"
								_hover={{ borderColor: 'var(--wc-border-hover)', color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }}
								borderRadius="md" fontSize="10px" gap="1" onClick={() => isEditing ? handleSave() : handleEdit()}>
								{isEditing ? <Check size={10} /> : <Pencil size={10} />}
								{isEditing ? 'Save' : 'Edit'}
							</Button>
						</HStack>
					</Box>
				)}
			</VStack>
		</Card>
	);
});
