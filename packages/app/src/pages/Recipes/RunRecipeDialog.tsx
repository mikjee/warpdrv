import { useState, useEffect, useMemo, useCallback } from 'react';
import { Box, Text, VStack, HStack, Flex, Button, Spinner, Badge } from '@chakra-ui/react';
import { X, Play, Square, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { parseRecipe, ERecipeRunStatus, type IRecipe, type TRecipeInputValues } from '@warpcore/shared';
import { runRecipe, cancelRecipeRun, fetchRecipeState } from '../../api/services';
import { useStore } from '../../store';
import { InputFormGenerator } from './InputFormGenerator';
import { StepPanel } from './StepPanel';

interface IRunRecipeDialogProps {
	recipe: IRecipe;
	onClose: () => void;
}

const RUN_STATUS_CONFIG: Record<ERecipeRunStatus, { color: string; icon: typeof CheckCircle; label: string }> = {
	[ERecipeRunStatus.RUNNING]: { color: 'var(--wc-accent-yellow)', icon: Play, label: 'Running' },
	[ERecipeRunStatus.OK]: { color: 'var(--wc-accent-green)', icon: CheckCircle, label: 'Completed' },
	[ERecipeRunStatus.FAILED]: { color: 'var(--wc-accent-red)', icon: AlertCircle, label: 'Failed' },
	[ERecipeRunStatus.CANCELLED]: { color: 'var(--wc-text-tertiary)', icon: XCircle, label: 'Cancelled' },
};

export function RunRecipeDialog({ recipe, onClose }: IRunRecipeDialogProps) {
	const activeRun = useStore((s) => s.activeRun);

	const parseResult = useMemo(() => {
		try { return { parsed: parseRecipe(recipe.source), error: null as string | null }; }
		catch (err) { return { parsed: null, error: (err as Error).message }; }
	}, [recipe.source]);

	const [values, setValues] = useState<TRecipeInputValues>({});
	const [starting, setStarting] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const [serverError, setServerError] = useState<string | null>(null);

	// Load last-used inputs on open, falling back to defaults
	useEffect(() => {
		let cancelled = false;
		(async () => {
			const result = await fetchRecipeState(recipe.id);
			if (cancelled) return;
			const lastInputs = result.ok && result.data ? result.data.lastInputs : {};
			const seeded: TRecipeInputValues = {};
			if (parseResult.parsed) {
				for (const input of parseResult.parsed.inputs) {
					if (lastInputs[input.name] !== undefined) seeded[input.name] = lastInputs[input.name]!;
					else if (input.defaultValue !== undefined) seeded[input.name] = input.defaultValue;
				}
			}
			setValues(seeded);
		})();
		return () => { cancelled = true; };
	}, [recipe.id, parseResult.parsed]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	const isThisRecipeActive = activeRun !== null && activeRun.recipeId === recipe.id;
	const isOtherRunActive = activeRun !== null && activeRun.recipeId !== recipe.id && activeRun.status === ERecipeRunStatus.RUNNING;
	const isRunning = isThisRecipeActive && activeRun!.status === ERecipeRunStatus.RUNNING;
	const isFinished = isThisRecipeActive && activeRun!.status !== ERecipeRunStatus.RUNNING;

	const handleChange = useCallback((name: string, value: string | number | boolean) => {
		setValues(prev => ({ ...prev, [name]: value }));
	}, []);

	const handleRun = async () => {
		if (parseResult.error !== null) return;
		setStarting(true);
		setServerError(null);
		const result = await runRecipe(recipe.id, { inputs: values });
		setStarting(false);
		if (!result.ok) setServerError(result.error);
	};

	const handleCancel = async () => {
		setCancelling(true);
		await cancelRecipeRun();
		setCancelling(false);
	};

	const statusConfig = isThisRecipeActive ? RUN_STATUS_CONFIG[activeRun!.status] : null;
	const StatusIcon = statusConfig?.icon;

	const canRun = parseResult.error === null && !starting && !isRunning && !isOtherRunActive;

	return (
<Box position="fixed" inset="6px" bg="var(--wc-overlay-modal)" zIndex="modal" display="flex" alignItems="center" justifyContent="center" borderRadius="12px" overflow="hidden" onClick={onClose}>
		<Box w="900px" maxW="95vw" h="80vh" bg="var(--wc-bg-page)" borderRadius="xl" borderWidth="1px" borderColor="var(--wc-border-default)" shadow="0 20px 80px rgba(0, 0, 0, 0.6)" display="flex" flexDirection="column" overflow="hidden" onClick={(e) => e.stopPropagation()}>
				{/* Header */}
				<Flex px="5" py="3" justify="space-between" align="center" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)" flexShrink={0}>
					<HStack gap="3">
						<Text fontSize="14px" fontWeight="600" color="var(--wc-text-heading)">{recipe.name}</Text>
						{statusConfig && StatusIcon && (
							<HStack gap="1.5" px="2" py="0.5" borderRadius="full" bg="var(--wc-bg-interactive)">
								<Box color={statusConfig.color}><StatusIcon size={11} /></Box>
								<Text fontSize="10px" fontWeight="600" color={statusConfig.color}>{statusConfig.label}</Text>
							</HStack>
						)}
					</HStack>
					<Button size="xs" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }} onClick={onClose}>
						<X size={14} />
					</Button>
				</Flex>

				{/* Body */}
				<Box flex="1" overflowY="auto" px="5" py="4">
					{parseResult.error !== null ? (
						<Flex h="200px" alignItems="center" justifyContent="center" direction="column" gap="2" color="var(--wc-accent-red)">
							<AlertCircle size={32} />
							<Text fontSize="13px">Recipe is invalid</Text>
							<Text fontSize="11px" fontFamily='"Geist Mono", monospace' color="var(--wc-accent-red-border)">{parseResult.error}</Text>
						</Flex>
					) : (
						<VStack align="stretch" gap="5">
							{/* Inputs */}
							{parseResult.parsed!.inputs.length > 0 && (
								<Box>
									<Text fontSize="11px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Inputs</Text>
									<InputFormGenerator
										inputs={parseResult.parsed!.inputs}
										values={values}
										onChange={handleChange}
										disabled={isRunning}
									/>
								</Box>
							)}

							{/* Steps */}
							<Box>
								<Text fontSize="11px" fontWeight="600" color="var(--wc-text-tertiary)" textTransform="uppercase" letterSpacing="0.05em" mb="3">Steps</Text>
								{isThisRecipeActive ? (
									<VStack align="stretch" gap="2">
										{activeRun!.steps.map((step) => (
											<StepPanel key={step.id} step={step} />
										))}
									</VStack>
								) : (
									<VStack align="stretch" gap="1.5">
										{parseResult.parsed!.steps.map((step, i) => (
											<HStack key={step.id} gap="2" px="2.5" py="1.5" borderRadius="md" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor="var(--wc-border-subtle)">
												<Text fontSize="10px" color="var(--wc-text-faint)" fontFamily='"Geist Mono", monospace' minW="20px">{i + 1}.</Text>
												<Text fontSize="12px" color="var(--wc-text-primary)" flex="1">{step.name}</Text>
												{step.cwd && (
													<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-bg-interactive)" color="var(--wc-text-tertiary)" fontSize="10px" fontFamily='"Geist Mono", monospace'>{step.cwd}</Badge>
												)}
											</HStack>
										))}
									</VStack>
								)}
							</Box>
						</VStack>
					)}
				</Box>

				{/* Footer */}
				<Flex px="5" py="3" justify="space-between" align="center" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" flexShrink={0}>
					{serverError ? (
						<HStack gap="1.5" color="var(--wc-accent-red)">
							<AlertCircle size={12} />
							<Text fontSize="11px">{serverError}</Text>
						</HStack>
					) : isOtherRunActive ? (
						<HStack gap="1.5" color="var(--wc-accent-yellow)">
							<AlertCircle size={12} />
							<Text fontSize="11px">Another recipe is currently running</Text>
						</HStack>
					) : <Box />}
					<HStack gap="2">
						<Button size="sm" variant="ghost" color="var(--wc-text-tertiary)" _hover={{ color: 'var(--wc-text-primary)', bg: 'var(--wc-bg-hover)' }} onClick={onClose}>{isFinished || !isThisRecipeActive ? 'Close' : 'Hide'}</Button>
						{isRunning ? (
							<Button size="sm" bg="var(--wc-accent-red-bg-8)" color="var(--wc-accent-red)" _hover={{ bg: 'var(--wc-accent-red-hover)' }} onClick={handleCancel} disabled={cancelling}>
								{cancelling ? <Spinner size="xs" /> : <Square size={13} />}
								<Text ml="1.5">Cancel</Text>
							</Button>
						) : (
							<Button size="sm" bg={canRun ? 'var(--wc-accent-green-bg-8)' : 'var(--wc-bg-interactive)'} color={canRun ? 'var(--wc-accent-green)' : 'var(--wc-text-faint)'} _hover={canRun ? { bg: 'var(--wc-accent-green-hover-bg)' } : undefined} onClick={handleRun} disabled={!canRun}>
								{starting ? <Spinner size="xs" /> : <Play size={13} />}
								<Text ml="1.5">{isFinished ? 'Run Again' : 'Run'}</Text>
							</Button>
						)}
					</HStack>
				</Flex>
			</Box>
		</Box>
	);
}
