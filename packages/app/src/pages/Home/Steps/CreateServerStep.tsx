import { Text, VStack, Link as ChakraLink } from '@chakra-ui/react';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { StepCollapsible } from '../StepCollapsible';

export const CreateServerStep = React.memo(({ done, isOpenDefault, isHighlighted }: { done: boolean; isOpenDefault: boolean; isHighlighted?: boolean }) => (
	<StepCollapsible
		title={done ? 'Server created' : 'Create a server'}
		done={done}
		isOpenDefault={isOpenDefault}
		isHighlighted={isHighlighted}
	>
		<VStack align="stretch" gap="3">
			<Text fontSize="13px" color="var(--wc-text-tertiary)" lineHeight="1.6">
				1. Navigate to the{' '}
				<ChakraLink as={NavLink} to="/servers" style={{ textDecoration: 'none' }} color="var(--wc-accent-blue)" _hover={{ color: 'var(--wc-accent-blue-hover)' }}>
					Servers
				</ChakraLink>{' '}
				page.
				<br />
				<br />
				2. Click Launch Server.
				<br />
				<br />
				3. Select the model you added from the dropdown list of models.
				<br />
				<br />
				4. Select the backend you registered from the dropdown list of backends.
				<br />
				<br />
				5. Select the device to load the model on.
				<br />
				<br />
				6. Configure params such as context length (how much text the model can remember), number of threads (CPU cores for inference), and GPU layers (how many model layers to offload to GPU for faster inference). Adjust these based on your hardware - more GPU layers means faster inference but requires more VRAM.
				<br />
				<br />
				7. Click Launch to start the server.
			</Text>
		</VStack>
	</StepCollapsible>
));
