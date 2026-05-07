import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { openExternal } from '../../../utils/openExternal';
import { StepCollapsible } from '../StepCollapsible';

export const RegisterBackendStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => (
	<StepCollapsible
		title={done ? 'Backend Registered' : 'Add a LLaMA Backend'}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				1. Visit{' '}
				<ChakraLink href="https://github.com/ggml-org/llama.cpp/releases" isExternal color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/ggml-org/llama.cpp/releases'); }}>
					LlaMA.cpp releases
				</ChakraLink>{' '}
				and download a prebuilt binary for your hardware.
				<br />
				Note: You can also <span style={{
					background: "var(--wc-special-code-bg)",
					fontFamily: "mono",
				}}>&nbsp;git clone https://github.com/ggml-org/llama.cpp.git&nbsp;</span> into a folder and build from source. See{' '}
				<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" isExternal color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }} onClick={(e) => { e.preventDefault(); openExternal('https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md'); }}>
					Recipes Guide
				</ChakraLink>.
				<br />
				<br />
				2. Open the{' '}
				<ChakraLink as={NavLink} to="/backends" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }}>
					Backends page
				</ChakraLink>{' '}
				and add a new backend.
				<br />
				<br />
				3. Open the file picker, navigate to the llama.cpp folder you downloaded and unzipped, then select the `llama-server` binary.
				<br />
				<br />
				4. Save the backend. It should auto-validate your system and detect the hardware.
			</Text>
		</VStack>
	</StepCollapsible>
));
