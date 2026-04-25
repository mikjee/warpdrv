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
						<Text fontSize="12px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Model Params</Text>
						<Text fontSize="11px" color="rgba(255, 255, 255, 0.3)">These params will apply to all servers that use this Model.</Text>
					</VStack>
					<Switch.Root label="Use recommended params" checked={useRecommended} onCheckedChange={(d) => onUseRecommendedChange(d.checked)} color={useRecommended ? '#3b86d6' : 'rgba(255, 255, 255, 0.4)'}>
						<Switch.HiddenInput />
						<Switch.Control css={{ bg: useRecommended ? '#3b86d6' : 'surface.4' }}>
							<Switch.Thumb css={{ bg: 'rgba(25, 25, 25)' }} />
						</Switch.Control>
					</Switch.Root>
				</HStack>
				{useRecommended && (
					<Box position="relative">
						<Textarea value={draftText} variant="subtle"
							bg={isEditing ? "rgb(30,30,30)" : "transparent"} outline="none"
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
								<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.6)"
									_hover={{ color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.1)' }} borderRadius="md" fontSize="10px"
									onClick={handleCancel}>Cancel</Button>
							)}
							<Button size="xs" variant="outline" borderColor="rgba(255, 255, 255, 0.2)" color="rgba(255, 255, 255, 0.6)"
								_hover={{ borderColor: '#3b86d6', color: '#3b86d6', bg: 'rgba(51, 129, 255, 0.05)' }}
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
