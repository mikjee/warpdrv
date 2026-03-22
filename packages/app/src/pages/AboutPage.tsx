import { Box, Text, VStack, HStack, Link, Flex } from '@chakra-ui/react';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Github } from 'lucide-react';

export function AboutPage() {
	return (
		<Box>
			<PageHeader
				title="About"
				subtitle="WarpCore v0.1.0"
				icon={<Github size={20} />}
			/>
			<Box p="8" maxW="600px">
				<VStack align="stretch" gap="6">
					{/* Attribution */}
					<Card>
						<VStack gap="3">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Attribution</Text>
							<HStack gap="1.5" alignItems="center">
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.7)">
									Slop-coded with <Text as="span" color="#fb7185">❤</Text> by{' '}
								</Text>
								<Link href="https://www.github.com/mikjee" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline' }}>
									<Text fontSize="13px" fontWeight="500">@mikjee</Text>
								</Link>
							</HStack>
						</VStack>
					</Card>

					{/* Copyright */}
					<Card>
						<VStack gap="3">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Copyright</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)">
								© 2025 mikjee. All rights reserved.
							</Text>
						</VStack>
					</Card>

					{/* Legal Links */}
					<Card>
						<VStack gap="3">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Legal</Text>
							<Flex gap="4" flexWrap="wrap">
								<Link href="#" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline' }} fontSize="12px">
									License Agreement
								</Link>
								<Link href="#" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline' }} fontSize="12px">
									Privacy Policy
								</Link>
							</Flex>
						</VStack>
					</Card>

					{/* Footer */}
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.2)" textAlign="center" mt="2">
						Engine room for WarpDrv
					</Text>
				</VStack>
			</Box>
		</Box>
	);
}
