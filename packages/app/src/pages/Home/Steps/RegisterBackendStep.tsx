import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { StepCollapsible } from '../StepCollapsible';

export const RegisterBackendStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => (
	<StepCollapsible
		title={done ? 'Backend Registered' : 'Add a LLaMA Backend'}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="rgba(255,255,255,0.5)" lineHeight="1.6">
				1. Visit{' '}
				<ChakraLink href="https://github.com/ggml-org/llama.cpp/releases" isExternal color="#3381ff" _hover={{ color: '#5a98ff' }}>
					LlaMA.cpp releases
				</ChakraLink>{' '}
				and download a prebuilt binary for your hardware.
				<br />
				Note: You can also <span style={{
					background: "#3a3a3a",
					fontFamily: "mono",
				}}>&nbsp;git clone https://github.com/ggml-org/llama.cpp.git&nbsp;</span> into a folder and build from source. See{' '}
				<ChakraLink href="https://github.com/mikjee/warpdrv/blob/master/docs/guides/recipes.md" isExternal color="#3381ff" _hover={{ color: '#5a98ff' }}>
					Recipes Guide
				</ChakraLink>.
				<br />
				<br />
				2. Open the{' '}
				<ChakraLink as={NavLink} to="/backends" style={{ textDecoration: 'none' }} color="#3381ff" _hover={{ color: '#5a98ff' }}>
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
