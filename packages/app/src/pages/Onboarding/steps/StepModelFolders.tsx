import { useState, useCallback } from 'react';
import { Box, Text, Input, Button, Spinner, HStack, Flex, VStack } from '@chakra-ui/react';
import { Plus, Trash2, FolderInput, FolderOpen, Check, AlertCircle } from 'lucide-react';
import { useDependantState } from '@/hooks/useDependantState';
import { useStore } from '@/store';
import { scanModels, updateSettings } from '@/api/services';
import { useToast } from '@/components/ToastProvider';
import { OnboardingHeader } from '../components/OnboardingHeader';
import { OnboardingFooter } from '../components/OnboardingFooter';
import type { IStepProps } from '../OnboardingPage';

export function StepModelFolders({ goNext, goPrev, finishOnboarding }: IStepProps) {
	const { toast } = useToast();
	const settings = useStore(s => s.settings);
	const models = useStore(s => s.models);
	const [modelRoots, setModelRoots] = useDependantState(settings.modelRoots);
	const [newRoot, setNewRoot] = useState('');
	const [isScanning, setIsScanning] = useState(false);
	const [hasScanned, setHasScanned] = useState(false);

	const modelCount = Object.values(models).length;

	const handleAddRoot = () => {
		const trimmed = newRoot.trim();
		if (trimmed && !modelRoots.includes(trimmed)) {
			setModelRoots([...modelRoots, trimmed]);
			setNewRoot('');
			setHasScanned(false);
		}
	};

	const handleRemoveRoot = (idx: number) => {
		setModelRoots(modelRoots.filter((_, i) => i !== idx));
		setHasScanned(false);
	};

	const handleBrowseDirectory = async () => {
		try {
			const mod = await import('@tauri-apps/plugin-dialog');
			const path = await mod.open({ directory: true, multiple: false });
			if (path && !modelRoots.includes(path)) {
				setModelRoots([...modelRoots, path]);
				setHasScanned(false);
			}
		} catch {
			try {
				const handle = await (window as any).showDirectoryPicker();
				if (handle) {
					setNewRoot(handle.name);
				}
			} catch (err: any) {
				if (err.name !== 'AbortError') {
					toast('error', 'Directory picker not supported. Type the path manually.');
				}
			}
		}
	};

	const handleSaveAndScan = useCallback(async () => {
		if (modelRoots.length === 0) return;
		setIsScanning(true);
		try {
			await updateSettings({ modelRoots });
			await scanModels();
			setHasScanned(true);
		} catch {
			toast('error', 'Scan failed');
		} finally {
			setIsScanning(false);
		}
	}, [modelRoots, toast]);

	return (
		<Box display="flex" flexDirection="column" h="100%">
			<Box px="4" pt="8">
				<OnboardingHeader title="Model Folders" step={1} totalSteps={4} />
			</Box>

			<Box flex="1" display="flex" alignItems="center" px="4" py="4" overflow="auto">
				<Box w="100%" maxW="520px" mx="auto">
					<Text fontSize="14px" color="rgba(255, 255, 255, 0.45)" textAlign="center" mb="6">
						Tell WarpCore where your GGUF models live. Models should follow the user/model folder structure.
					</Text>

					<VStack align="stretch" gap="2" mb="5">
						{modelRoots.map((root, idx) => (
							<HStack key={idx} gap="2">
								<Flex w="8" h="8" borderRadius="md" alignItems="center" justifyContent="center" bg="rgba(255, 255, 255, 0.04)" flexShrink={0}>
									<FolderOpen size={14} color="rgba(255, 255, 255, 0.4)" />
								</Flex>
								<Text flex="1" fontSize="12px" color="rgba(255, 255, 255, 0.6)" fontFamily='"Geist Mono", monospace' isTruncated>
									{root}
								</Text>
								<Button
									size="sm"
									variant="ghost"
									color="rgba(255, 255, 255, 0.3)"
									_hover={{ color: '#fb7185' }}
									borderRadius="md"
									minW="8"
									px="0"
									onClick={() => handleRemoveRoot(idx)}
								>
									<Trash2 size={14} />
								</Button>
							</HStack>
						))}

						<HStack gap="2">
							<Input
								placeholder="/path/to/models"
								size="sm"
								bg="rgba(255, 255, 255, 0.03)"
								borderColor="rgba(255, 255, 255, 0.08)"
								color="rgba(255, 255, 255, 0.7)"
								fontFamily='"Geist Mono", monospace'
								fontSize="12px"
								borderRadius="lg"
								_placeholder={{ color: 'rgba(255, 255, 255, 0.2)' }}
								_focus={{ borderColor: 'rgba(51, 129, 255, 0.4)', outline: 'none' }}
								value={newRoot}
								onChange={e => setNewRoot(e.target.value)}
								onKeyDown={e => e.key === 'Enter' && handleAddRoot()}
							/>
							<Button
								size="sm"
								variant="ghost"
								color="rgba(255, 255, 255, 0.4)"
								_hover={{ color: '#a78bfa' }}
								borderRadius="lg"
								minW="8"
								px="0"
								onClick={handleBrowseDirectory}
								title="Browse directory"
							>
								<FolderInput size={14} />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								color="rgba(255, 255, 255, 0.4)"
								_hover={{ color: '#3381ff' }}
								borderRadius="lg"
								onClick={handleAddRoot}
								disabled={!newRoot.trim()}
							>
								<Plus size={14} />
							</Button>
						</HStack>
					</VStack>

					<Flex justify="center" mb="4">
						<Button
							size="sm"
							bg="rgba(51, 129, 255, 0.12)"
							color="#3381ff"
							borderWidth="1px"
							borderColor="rgba(51, 129, 255, 0.25)"
							_hover={{ bg: 'rgba(51, 129, 255, 0.2)' }}
							borderRadius="lg"
							leftIcon={isScanning ? <Spinner size="xs" /> : <Check size={15} />}
							onClick={handleSaveAndScan}
							disabled={modelRoots.length === 0 || isScanning}
						>
							{isScanning ? 'Scanning...' : 'Save & Scan'}
						</Button>
					</Flex>

					{hasScanned && (
						<Flex justify="center">
							<HStack
								gap="2"
								px="4"
								py="2.5"
								borderRadius="lg"
								bg={modelCount > 0 ? 'rgba(52, 211, 153, 0.08)' : 'rgba(251, 191, 36, 0.08)'}
								borderWidth="1px"
								borderColor={modelCount > 0 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)'}
							>
								{modelCount > 0 ? (
									<Check size={15} color="#34d399" />
								) : (
									<AlertCircle size={15} color="#fbbf24" />
								)}
								<Text fontSize="13px" color={modelCount > 0 ? '#34d399' : '#fbbf24'} fontWeight="500">
									{modelCount} {modelCount === 1 ? 'model' : 'models'} found
								</Text>
							</HStack>
						</Flex>
					)}
				</Box>
			</Box>

			<OnboardingFooter onBack={goPrev} onNext={goNext} nextLabel={hasScanned ? 'Next' : 'Skip'} />
		</Box>
	);
}
