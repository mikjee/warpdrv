import { useState, useEffect, useMemo } from 'react';
import { Box, Text, VStack, HStack, Flex, Button, Input, Textarea, Spinner } from '@chakra-ui/react';
import { X, Save, AlertCircle, CheckCircle } from 'lucide-react';
import { parseRecipe, type IRecipe, type IRecipeParsed } from '@warpcore/shared';
import { createRecipe, updateRecipe } from '../../api/services';
import { InputFormGenerator } from './InputFormGenerator';

interface IRecipeEditorDialogProps {
	editData?: IRecipe;
	onClose: () => void;
}

const STARTER_SOURCE = `#!input BRANCH string default=master
#!input BUILD_DIR string default=~/llama.cpp

#!step Clone
git clone -b $BRANCH https://github.com/ggerganov/llama.cpp $BUILD_DIR

#!step Configure cwd=~/llama.cpp
cmake -B build -DGGML_CUDA=ON

#!step Build cwd=~/llama.cpp
cmake --build build -j
`;

export function RecipeEditorDialog({ editData, onClose }: IRecipeEditorDialogProps) {
	const [name, setName] = useState(editData?.name ?? '');
	const [description, setDescription] = useState(editData?.description ?? '');
	const [source, setSource] = useState(editData?.source ?? STARTER_SOURCE);
	const [saving, setSaving] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	const parseResult = useMemo((): { parsed: IRecipeParsed | null; error: string | null } => {
		try {
			return { parsed: parseRecipe(source), error: null };
		}
		catch (err) {
			return { parsed: null, error: (err as Error).message };
		}
	}, [source]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	const canSave = name.trim().length > 0 && parseResult.error === null && !saving;

	const handleSave = async () => {
		if (!canSave) return;
		setSaving(true);
		setServerError(null);
		const payload = { name: name.trim(), description: description.trim(), source };
		const result = editData
			? await updateRecipe(editData.id, payload)
			: await createRecipe(payload);
		setSaving(false);
		if (result.ok) onClose();
		else setServerError(result.error);
	};

	return (
		<Box position="fixed" inset="0" bg="rgba(0, 0, 0, 0.6)" zIndex="modal" display="flex" alignItems="center" justifyContent="center" onClick={onClose}>
			<Box w="1100px" maxW="95vw" h="80vh" bg="#0e0e0e" borderRadius="xl" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" shadow="0 20px 80px rgba(0, 0, 0, 0.6)" display="flex" flexDirection="column" overflow="hidden" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<Flex px="5" py="3" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" flexShrink={0}>
					<Text fontSize="14px" fontWeight="600" color="rgba(255, 255, 255, 0.8)">{editData ? 'Edit Recipe' : 'New Recipe'}</Text>
					<Button size="xs" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} onClick={onClose}>
						<X size={14} />
					</Button>
				</Flex>

				{/* Name + description */}
				<VStack align="stretch" gap="2" px="5" py="3" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" flexShrink={0}>
					<Input
						size="sm"
						placeholder="Recipe name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						bg="rgba(255, 255, 255, 0.02)"
						borderColor="rgba(255, 255, 255, 0.08)"
						color="#e4e4e7"
						fontSize="13px"
						_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
						_focus={{ borderColor: '#3381ff' }}
					/>
					<Input
						size="sm"
						placeholder="Description (optional)"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						bg="rgba(255, 255, 255, 0.02)"
						borderColor="rgba(255, 255, 255, 0.08)"
						color="#e4e4e7"
						fontSize="12px"
						_hover={{ borderColor: 'rgba(255, 255, 255, 0.15)' }}
						_focus={{ borderColor: '#3381ff' }}
					/>
				</VStack>

				{/* Split: editor + preview */}
				<Flex flex="1" overflow="hidden">
					<Box flex="1" display="flex" flexDirection="column" borderRightWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
						<Flex px="4" py="2" align="center" justify="space-between" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.015)">
							<Text fontSize="11px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Source</Text>
							{parseResult.error ? (
								<HStack gap="1.5" color="#fb7185">
									<AlertCircle size={12} />
									<Text fontSize="11px" fontFamily='"Geist Mono", monospace'>{parseResult.error}</Text>
								</HStack>
							) : (
								<HStack gap="1.5" color="#34d399">
									<CheckCircle size={12} />
									<Text fontSize="11px">Valid</Text>
								</HStack>
							)}
						</Flex>
						<Textarea
							flex="1"
							value={source}
							onChange={(e) => setSource(e.target.value)}
							bg="#0c0c0f"
							border="none"
							borderRadius="0"
							color="rgba(255, 255, 255, 0.85)"
							fontSize="12px"
							fontFamily='"Geist Mono", monospace'
							lineHeight="1.6"
							resize="none"
							spellCheck={false}
							px="4"
							py="3"
							_focus={{ outline: 'none', boxShadow: 'none' }}
						/>
					</Box>

					<Box w="380px" display="flex" flexDirection="column" overflow="hidden">
						<Flex px="4" py="2" align="center" justify="space-between" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.015)">
							<Text fontSize="11px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em">Preview</Text>
						</Flex>
						<Box flex="1" overflowY="auto" px="4" py="3">
							{parseResult.parsed === null ? (
								<Text fontSize="12px" color="rgba(255, 255, 255, 0.3)">Fix the source error to see preview.</Text>
							) : (
								<VStack align="stretch" gap="4">
									<Box>
										<Text fontSize="11px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Inputs ({parseResult.parsed.inputs.length})</Text>
										<InputFormGenerator
											inputs={parseResult.parsed.inputs}
											values={{}}
											onChange={() => {}}
											disabled={true}
										/>
									</Box>
									<Box>
										<Text fontSize="11px" fontWeight="600" color="rgba(255, 255, 255, 0.5)" textTransform="uppercase" letterSpacing="0.05em" mb="2">Steps ({parseResult.parsed.steps.length})</Text>
										<VStack align="stretch" gap="1.5">
											{parseResult.parsed.steps.map((step, i) => (
												<HStack key={step.id} gap="2" px="2.5" py="1.5" borderRadius="md" bg="rgba(255, 255, 255, 0.02)" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.06)">
													<Text fontSize="10px" color="rgba(255, 255, 255, 0.3)" fontFamily='"Geist Mono", monospace' minW="20px">{i + 1}.</Text>
													<Text fontSize="12px" color="#e4e4e7" flex="1">{step.name}</Text>
													{step.cwd && (
														<Text fontSize="10px" color="rgba(255, 255, 255, 0.35)" fontFamily='"Geist Mono", monospace'>{step.cwd}</Text>
													)}
												</HStack>
											))}
										</VStack>
									</Box>
								</VStack>
							)}
						</Box>
					</Box>
				</Flex>

				{/* Footer */}
				<Flex px="5" py="3" justify="space-between" align="center" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" flexShrink={0}>
					{serverError ? (
						<HStack gap="1.5" color="#fb7185">
							<AlertCircle size={12} />
							<Text fontSize="11px">{serverError}</Text>
						</HStack>
					) : <Box />}
					<HStack gap="2">
						<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.5)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} onClick={onClose} disabled={saving}>Cancel</Button>
						<Button size="sm" bg={canSave ? 'rgba(51, 129, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)'} color={canSave ? '#60a5fa' : 'rgba(255, 255, 255, 0.3)'} _hover={canSave ? { bg: 'rgba(51, 129, 255, 0.25)' } : undefined} onClick={handleSave} disabled={!canSave}>
							{saving ? <Spinner size="xs" /> : <Save size={13} />}
							<Text ml="1.5">Save</Text>
						</Button>
					</HStack>
				</Flex>
			</Box>
		</Box>
	);
}
