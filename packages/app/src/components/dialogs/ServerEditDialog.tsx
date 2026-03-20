import { useState } from 'react';
import { Box, Text, HStack, VStack, Flex, Input, Button, Switch } from '@chakra-ui/react';
import { X, Server, Play } from 'lucide-react';
import { Card } from '../Card';
import type { IServer, IBackend, IModel, ILaunchParams } from '@warpcore/shared';

interface IServerEditDialogProps {
	server: IServer;
	backends: IBackend[];
	models: IModel[];
	onClose: () => void;
	onRelaunch: (backendId: string, modelPath: string, params: ILaunchParams) => Promise<void>;
}

export function ServerEditDialog({ server, backends, models, onClose, onRelaunch }: IServerEditDialogProps) {
	const [backendId, setBackendId] = useState(server.backendId);
	const [modelPath, setModelPath] = useState(server.modelPath);
	const [params, setParams] = useState<ILaunchParams>({ ...server.params });

	const backendLabels = Object.fromEntries(backends.map(b => [b.id, b.name]));

	// Build model options from scanned models
	const modelPathToAlias = Object.fromEntries(
		models.flatMap(m =>
			m.files.filter(f => !f.isMmproj).map(f => [f.filePath, `${m.user}/${m.name}`])
		)
	);

	const updateParam = (key: keyof ILaunchParams, value: any) => {
		setParams(p => ({ ...p, [key]: value }));
	};

	const handleRelaunch = async () => {
		await onRelaunch(backendId, modelPath, params);
		onClose();
	};

	const canSave = backendId && modelPath;

	return (
		<Box position="fixed" inset="0" zIndex="modal" display="flex" alignItems="center" justifyContent="center">
			<Box position="absolute" inset="0" bg="rgba(0, 0, 0, 0.7)" backdropFilter="blur(8px)" onClick={onClose} />

			<Box position="relative" w="640px" maxH="90vh" bg="#0f0f12" borderWidth="1px" borderColor="rgba(255, 255, 255, 0.08)" borderRadius="2xl" shadow="0 24px 80px rgba(0, 0, 0, 0.6)" overflow="hidden" display="flex" flexDirection="column">
				{/* Header */}
				<Flex px="6" py="4" justify="space-between" align="center" borderBottomWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<HStack gap="3">
						<Flex w="9" h="9" borderRadius="lg" alignItems="center" justifyContent="center" bg="rgba(51, 129, 255, 0.1)" borderWidth="1px" borderColor="rgba(51, 129, 255, 0.2)">
							<Server size={18} color="#3381ff" />
						</Flex>
						<Box>
							<Text fontSize="16px" fontWeight="700" color="#e4e4e7">Edit Server</Text>
							<Text fontSize="12px" color="rgba(255, 255, 255, 0.35)">Modify launch parameters — requires relaunch</Text>
						</Box>
					</HStack>
					<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.3)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="md" onClick={onClose} minW="8" px="0">
						<X size={16} />
					</Button>
				</Flex>

				{/* Content */}
				<Box flex="1" overflowY="auto" p="6">
					<VStack align="stretch" gap="5">
						{/* Backend & Model */}
						<Card bg="rgba(255, 255, 255, 0.02)" borderColor="rgba(255, 255, 255, 0.06)">
							<VStack align="stretch" gap="3">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Backend & Model</Text>

								<Box>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">Backend</Text>
									<Input
										value={backendLabels[backendId] ?? backendId}
										readOnly
										bg="rgba(255, 255, 255, 0.03)"
										borderColor="rgba(255, 255, 255, 0.08)"
										color="rgba(255, 255, 255, 0.7)"
										fontSize="13px"
										borderRadius="lg"
									/>
								</Box>

								<Box>
									<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">Model Path</Text>
									<Input
										value={modelPathToAlias[modelPath] ?? modelPath}
										readOnly
										bg="rgba(255, 255, 255, 0.03)"
										borderColor="rgba(255, 255, 255, 0.08)"
										color="rgba(255, 255, 255, 0.7)"
										fontFamily='"Geist Mono", monospace'
										fontSize="12px"
										borderRadius="lg"
									/>
								</Box>
							</VStack>
						</Card>

						{/* GPU Layers & Context */}
						<Card bg="rgba(255, 255, 255, 0.02)" borderColor="rgba(255, 255, 255, 0.06)">
							<VStack align="stretch" gap="3">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">GPU & Context</Text>

								<HStack gap="4">
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">GPU Layers</Text>
										<Input
											type="number"
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="13px"
											borderRadius="lg"
											value={params.gpuLayers}
											onChange={e => updateParam('gpuLayers', parseInt(e.target.value) || 0)}
										/>
									</Box>
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">Context Size</Text>
										<Input
											type="number"
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="13px"
											borderRadius="lg"
											value={params.contextSize}
											onChange={e => updateParam('contextSize', parseInt(e.target.value) || 0)}
										/>
									</Box>
								</HStack>

								<HStack gap="4">
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">Batch Size</Text>
										<Input
											type="number"
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="13px"
											borderRadius="lg"
											value={params.batchSize}
											onChange={e => updateParam('batchSize', parseInt(e.target.value) || 0)}
										/>
									</Box>
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">UBatch Size</Text>
										<Input
											type="number"
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="13px"
											borderRadius="lg"
											value={params.ubatchSize}
											onChange={e => updateParam('ubatchSize', parseInt(e.target.value) || 0)}
										/>
									</Box>
								</HStack>
							</VStack>
						</Card>

						{/* Flags */}
						<Card bg="rgba(255, 255, 255, 0.02)" borderColor="rgba(255, 255, 255, 0.06)">
							<VStack align="stretch" gap="3">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Flags</Text>

								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">Flash Attention</Text>
									<Switch isChecked={params.flashAttn} onChange={e => updateParam('flashAttn', e.target.checked)} />
								</HStack>
								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">MLOCK</Text>
									<Switch isChecked={params.mlock} onChange={e => updateParam('mlock', e.target.checked)} />
								</HStack>
								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">MMAP</Text>
									<Switch isChecked={params.mmap} onChange={e => updateParam('mmap', e.target.checked)} />
								</HStack>
								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">Direct I/O</Text>
									<Switch isChecked={params.directIo} onChange={e => updateParam('directIo', e.target.checked)} />
								</HStack>
								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">No Warmup</Text>
									<Switch isChecked={params.noWarmup} onChange={e => updateParam('noWarmup', e.target.checked)} />
								</HStack>
								<HStack justify="space-between" py="1">
									<Text fontSize="13px" color="rgba(255, 255, 255, 0.6)">Jinja Templates</Text>
									<Switch isChecked={params.jinja} onChange={e => updateParam('jinja', e.target.checked)} />
								</HStack>
							</VStack>
						</Card>

						{/* KV Quant */}
						<Card bg="rgba(255, 255, 255, 0.02)" borderColor="rgba(255, 255, 255, 0.06)">
							<VStack align="stretch" gap="3">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">KV Cache Quantization</Text>

								<HStack gap="4">
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">K-Quant</Text>
										<Input
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="12px"
											borderRadius="lg"
											value={params.kvQuantK}
											readOnly
										/>
									</Box>
									<Box flex="1">
										<Text fontSize="12px" color="rgba(255, 255, 255, 0.5)" mb="2">V-Quant</Text>
										<Input
											size="sm"
											bg="rgba(255, 255, 255, 0.03)"
											borderColor="rgba(255, 255, 255, 0.08)"
											color="#e4e4e7"
											fontFamily='"Geist Mono", monospace'
											fontSize="12px"
											borderRadius="lg"
											value={params.kvQuantV}
											readOnly
										/>
									</Box>
								</HStack>
							</VStack>
						</Card>

						{/* Extra Args */}
						<Card bg="rgba(255, 255, 255, 0.02)" borderColor="rgba(255, 255, 255, 0.06)">
							<VStack align="stretch" gap="3">
								<Text fontSize="11px" color="rgba(255, 255, 255, 0.35)" textTransform="uppercase" letterSpacing="0.05em">Extra Arguments</Text>

								<Input
									placeholder="--custom-flags here"
									size="sm"
									bg="rgba(255, 255, 255, 0.03)"
									borderColor="rgba(255, 255, 255, 0.08)"
									color="#e4e4e7"
									fontFamily='"Geist Mono", monospace'
									fontSize="12px"
									borderRadius="lg"
									value={params.extraArgs}
									onChange={e => updateParam('extraArgs', e.target.value)}
								/>
							</VStack>
						</Card>

						{/* Error display */}
						{server.error && (
							<Card bg="rgba(251, 113, 133, 0.04)" borderColor="rgba(251, 113, 133, 0.2)">
								<Text fontSize="12px" color="#fb7185" fontFamily='"Geist Mono", monospace' lineClamp={2}>
									Error: {server.error}
								</Text>
							</Card>
						)}
					</VStack>
				</Box>

				{/* Footer */}
				<Flex px="6" py="4" justify="flex-end" gap="2" borderTopWidth="1px" borderColor="rgba(255, 255, 255, 0.06)" bg="rgba(255, 255, 255, 0.01)">
					<Button size="sm" variant="ghost" color="rgba(255, 255, 255, 0.4)" _hover={{ color: '#e4e4e7', bg: 'rgba(255, 255, 255, 0.06)' }} borderRadius="lg" fontSize="13px" onClick={onClose}>
						Cancel
					</Button>
					<Button
						size="sm"
						disabled={!canSave}
						bg="rgba(51, 129, 255, 0.15)"
						color="#3381ff"
						borderWidth="1px"
						borderColor="rgba(51, 129, 255, 0.3)"
						_hover={{ bg: 'rgba(51, 129, 255, 0.25)' }}
						_disabled={{ opacity: 0.3, cursor: 'not-allowed' }}
						borderRadius="lg"
						fontSize="13px"
						fontWeight="600"
					 px="5"
						onClick={handleRelaunch}
					>
						<Play size={14} />
						Relaunch with Changes
					</Button>
				</Flex>
			</Box>
		</Box>
	);
}
