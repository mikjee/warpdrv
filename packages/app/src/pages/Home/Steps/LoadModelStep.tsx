import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { StepCollapsible } from '../StepCollapsible';

export const LoadModelStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => (
	<StepCollapsible
		title={done ? 'Models Added' : 'Download a Model from HuggingFace and Add it.'}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				1. Go to{' '}
				<ChakraLink as={NavLink} to="/settings" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }}>
					Settings
				</ChakraLink>{' '}
				and select the folder where you want to keep your GGUF model files (if not already chosen).
				<br />
				<br />
				2. Navigate to the{' '}
				<ChakraLink as={NavLink} to="/hub" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }}>
					Hub
				</ChakraLink>{' '}
				page.
				<br />
				<br />
				3. Search for a model family name such as Qwen, Mistral, or Gemma.
				<br />
				<br />
				4. Click on a model from the results list on the left panel. Choose a model that's been released in the last 6 months for best capabilities.
				<br />
				<br />
				Note: Llama Models are different from Whisper Models. For whisper, search for "ggml" .bin models.
				<br />
				<br />
				5. On the right panel, open the dropdown for model files, and choose a quantized GGUF file that can fit into your VRAM with some space left over.
				<br />
				<br />
				6. Click download. The download progress window will be shown. You can pause and resume large downloads.
				<br />
				<br />
				7. Once download finishes, navigate to the{' '}
				<ChakraLink as={NavLink} to="/models" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }}>
					Models
				</ChakraLink>{' '}
				page and click Rescan Models button to add the model.
			</Text>
		</VStack>
	</StepCollapsible>
));
