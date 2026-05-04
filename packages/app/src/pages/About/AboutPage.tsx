import { Box, Text, VStack, HStack, Link, Flex } from '@chakra-ui/react';
import { openExternal } from '../../utils/openExternal';
import { PageHeader } from '../../components/PageHeader';
import { Card } from '../../components/Card';
import { Github } from 'lucide-react';

export function AboutPage() {
	return (
		<Box>
			<PageHeader
				title="warpdrv"
				icon={<Github size={20} />}
			/>
			<Box pt="76px" px="4" pb="4" display="flex" justifyContent="center" alignItems="center" minH="calc(100vh - 100px)" overflow="auto">
				<VStack align="center" gap="6" w="full" maxW="480px">
					{/* Logo */}
					<Box textAlign="center" py="4">
						<img src="/logo.png" alt="WarpDrv" width="160" />
					</Box>

					{/* Attribution */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">warpdrv.ai</Text>
							<VStack gap="1.5" alignItems="center">
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.7)">
									Built with <Text as="span" color="#fb7185">❤</Text> by&nbsp;
									<Link href="https://www.github.com/mikjee" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); openExternal('https://www.github.com/mikjee'); }}>
										<Text fontSize="13px" fontWeight="500">@mikjee</Text>
									</Link>
								</Text>
								<Text fontSize="13px" color="rgba(255, 255, 255, 0.7)">
									<Link href="https://warpdrv.ai" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline', cursor: 'pointer' }} onClick={(e) => { e.preventDefault(); openExternal('https://warpdrv.ai'); }}>
										<Text fontSize="13px" fontWeight="500">Visit Website</Text>
									</Link>
								</Text>
							</VStack>
						</VStack>
					</Card>

					{/* Copyright */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Copyright</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)">
								Copyright © 2026 mikjee. All rights reserved.
							</Text>
						</VStack>
					</Card>

					{/* Legal Links */}
					<Card>
						<VStack gap="3" align="center">
							<Text fontSize="14px" fontWeight="600" color="#e4e4e7">Legal</Text>
							<Flex gap="4" flexWrap="wrap" justifyContent="center">
								<Link href="https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE" color="#3381ff" _hover={{ color: '#5b6af5', textDecoration: 'underline' }} fontSize="12px" onClick={(e) => { e.preventDefault(); openExternal('https://raw.githubusercontent.com/mikjee/warpdrv/master/LICENSE'); }}>
									License Agreement - AGPL 3.0
								</Link>
							</Flex>
						</VStack>
					</Card>

					{/* Footer */}
					<Text fontSize="11px" color="rgba(255, 255, 255, 0.2)" textAlign="center" mt="2">
						Become a Sponsor 
					</Text>
				</VStack>
			</Box>
		</Box>
	);
}
