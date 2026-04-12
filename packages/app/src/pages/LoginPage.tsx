import { useState } from 'react';
import { Box, Flex, VStack, Text, Input, Button, Heading } from '@chakra-ui/react';
import { Key } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastProvider';
import { login } from '../api/services';

export function LoginPage() {
	const navigate = useNavigate();
	const { toast } = useToast();
	const [token, setToken] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!token.trim()) return;

		setLoading(true);
		const result = await login(token.trim());
		setLoading(false);

		if (result.ok) {
			toast('success', 'Logged in successfully');
			navigate('/');
		} else {
			toast('error', result.error ?? 'Login failed');
		}
	};

	return (
		<Flex
			minH="100vh"
			alignItems="center"
			justifyContent="center"
			bg="#0d0d0d"
			p="4"
		>
			<Box
				w="full"
				maxW="sm"
				p="6"
				borderRadius="xl"
				borderWidth="1px"
				borderColor="rgba(255,255,255,0.06)"
				bg="rgba(255,255,255,0.015)"
			>
				<VStack gap="4" align="stretch">
					<Flex alignItems="center" gap="3" mb="2">
						<Box
							w="10"
							h="10"
							borderRadius="lg"
							bg="rgba(59, 130, 246, 0.15)"
							borderWidth="1px"
							borderColor="rgba(59, 130, 246, 0.3)"
							display="flex"
							alignItems="center"
							justifyContent="center"
						>
							<Key size={18} color="#60a5fa" />
						</Box>
						<Heading fontSize="18px" color="rgba(255,255,255,0.9)">
							WarpCore
						</Heading>
					</Flex>

					<Text fontSize="13px" color="rgba(255,255,255,0.4)" fontWeight="500">
						Enter your access token to continue
					</Text>

					<form onSubmit={handleSubmit}>
						<VStack gap="3" align="stretch">
							<Input
								value={token}
								onChange={(e) => setToken(e.target.value)}
								placeholder="wc_..."
								size="sm"
								bg="rgba(0,0,0,0.2)"
								borderColor="rgba(255,255,255,0.08)"
								color="rgba(255,255,255,0.8)"
								fontSize="12px"
								_placeholder={{ color: 'rgba(255,255,255,0.2)' }}
								_focus={{ borderColor: 'rgba(59, 130, 246, 0.4)' }}
							/>

							<Button
								type="submit"
								size="sm"
								bg="rgba(59, 130, 246, 0.15)"
								color="#60a5fa"
								_hover={{ bg: 'rgba(59, 130, 246, 0.25)' }}
								fontSize="12px"
								fontWeight="500"
								disabled={loading || !token.trim()}
							>
								{loading ? 'Logging in...' : 'Login'}
							</Button>
						</VStack>
					</form>

					<Text fontSize="11px" color="rgba(255,255,255,0.25)" textAlign="center">
						Contact your WarpCore admin to get an access token
					</Text>
				</VStack>
			</Box>
		</Flex>
	);
}
