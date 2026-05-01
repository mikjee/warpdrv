import { Box, Text, HStack, VStack, Flex, Image } from '@chakra-ui/react';
import {
	Home as HomeIcon,
	ChevronDown,
	ChevronUp,
} from 'lucide-react';
import React, { useState, useMemo } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useStore } from '@/store';
import { RegisterBackendStep } from './Steps/RegisterBackendStep';
import { LoadModelStep } from './Steps/LoadModelStep';
import { CreateServerStep } from './Steps/CreateServerStep';
import { ServersTile } from './Tiles/ServersTile';
import { BackendsTile } from './Tiles/BackendsTile';
import { ModelsTile } from './Tiles/ModelsTile';
import { ProxyTile } from './Tiles/ProxyTile';
import { McpTile } from './Tiles/McpTile';
import { AppServerTile } from './Tiles/AppServerTile';

export const HomePage = React.memo(() => {
	const servers = useStore((s) => s.servers);
	const backends = useStore((s) => s.backends);
	const models = useStore((s) => s.models);

	const hasBackends = useMemo(() => Object.values(backends).length > 0, [backends]);
	const hasModels = useMemo(() => Object.values(models).length > 0, [models]);
	const hasServers = useMemo(() => Object.values(servers).length > 0, [servers]);

	const allComplete = hasBackends && hasModels && hasServers;

	const firstIncomplete = useMemo(() => {
		if (!hasBackends) return 'backends';
		if (!hasModels) return 'models';
		if (!hasServers) return 'server';
		return null;
	}, [hasBackends, hasModels, hasServers]);

	const [showSteps, setShowSteps] = useState(false);

	return (
		<Box>
			<PageHeader
				title="Home"
				icon={<HomeIcon size={20} />}
			/>

			<Box pt="76px" px="4" pb="4">
				<VStack align="stretch" gap="5">
					{/* Greeting */}
					<Flex align="center" justify="space-between">
						<HStack gap="3">
							<Image src="/logo.png" w="64px" h="64px" borderRadius="md" />
							<VStack align="flex-start" gap="0">
								<Text fontSize="20px" fontWeight="500" color="rgba(255,255,255,0.5)">
									Welcome
								</Text>
								<Text fontSize="24px" fontWeight="600" color="rgba(255,255,255,0.9)">
									{allComplete ? 'warpdrv is ready!' : "Setup"}
								</Text>
							</VStack>
						</HStack>
						{allComplete && (
							<Flex
								align="center"
								justify="center"
								h="40px"
								p="3"
								borderRadius="md"
								cursor="pointer"
								onClick={() => setShowSteps(!showSteps)}
								color="rgba(255,255,255,0.3)"
								_hover={{ bg: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}
								transition="all 0.15s ease"
								fontSize={"11px"}
							>	
								Details&nbsp;
								{!showSteps 
									? <ChevronDown size={20} transform={showSteps ? 'rotate(180deg)' : 'rotate(0deg)'} transition="transform 0.15s ease" />
									: <ChevronUp size={20} transform={showSteps ? 'rotate(180deg)' : 'rotate(0deg)'} transition="transform 0.15s ease" />
								}
							</Flex>
						)}
					</Flex>

					{(!allComplete || showSteps) && <Box w="100%" h="1px" bg="rgba(255,255,255,0.06)" />}

					{/* Next Steps */}
					{!allComplete || showSteps ? (
						<VStack align="stretch" gap="2">
							<RegisterBackendStep done={hasBackends} isOpenDefault={firstIncomplete === 'backends'} isHighlighted={firstIncomplete === 'backends'} />
							<LoadModelStep done={hasModels} isOpenDefault={firstIncomplete === 'models'} isHighlighted={firstIncomplete === 'models'} />
							<CreateServerStep done={hasServers} isOpenDefault={firstIncomplete === 'server'} isHighlighted={firstIncomplete === 'server'} />
						</VStack>
					) : null}

					<Box w="100%" h="1px" bg="rgba(255,255,255,0.06)" />

					{/* Overview Tiles */}
					<Box
						display="grid"
						gridTemplateColumns="repeat(auto-fill, minmax(250px, 1fr))"
						gap="4"
					>
						<ServersTile />
						<BackendsTile />
						<ModelsTile />
						<ProxyTile />
						<McpTile />
						<AppServerTile />
					</Box>
				</VStack>
			</Box>
		</Box>
	);
});
