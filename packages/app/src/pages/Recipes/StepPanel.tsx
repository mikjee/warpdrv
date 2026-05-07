import { useRef, useEffect, useState } from 'react';
import { Box, Text, HStack, Flex, Badge, Collapsible } from '@chakra-ui/react';
import { ChevronDown, ChevronRight, CheckCircle, AlertCircle, Circle, XCircle, Loader } from 'lucide-react';
import { useStore } from '../../store';
import { ERecipeStepStatus, type IRecipeStepState } from '@warpcore/shared';

interface IStepPanelProps {
	step: IRecipeStepState;
	defaultExpanded?: boolean;
}

const STATUS_CONFIG: Record<ERecipeStepStatus, { color: string; icon: typeof Circle; label: string }> = {
	[ERecipeStepStatus.PENDING]: { color: 'var(--wc-text-faint)', icon: Circle, label: 'Pending' },
	[ERecipeStepStatus.RUNNING]: { color: 'var(--wc-accent-yellow)', icon: Loader, label: 'Running' },
	[ERecipeStepStatus.OK]: { color: 'var(--wc-accent-green)', icon: CheckCircle, label: 'OK' },
	[ERecipeStepStatus.FAILED]: { color: 'var(--wc-accent-red)', icon: AlertCircle, label: 'Failed' },
	[ERecipeStepStatus.CANCELLED]: { color: 'var(--wc-text-tertiary)', icon: XCircle, label: 'Cancelled' },
	[ERecipeStepStatus.SKIPPED]: { color: 'var(--wc-text-faint)', icon: Circle, label: 'Skipped' },
};

export function StepPanel({ step, defaultExpanded = false }: IStepPanelProps) {
	const stepOutputs = useStore((s) => s.stepOutputs);
	const output = stepOutputs[step.id] ?? '';
	const [expanded, setExpanded] = useState(defaultExpanded || step.status === ERecipeStepStatus.RUNNING || step.status === ERecipeStepStatus.FAILED);
	const [autoScroll, setAutoScroll] = useState(true);
	const outputEndRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (autoScroll && outputEndRef.current) {
			outputEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [output, autoScroll]);

	useEffect(() => {
		if (step.status === ERecipeStepStatus.RUNNING || step.status === ERecipeStepStatus.FAILED) {
			setExpanded(true);
		}
	}, [step.status]);

	const config = STATUS_CONFIG[step.status];
	const StatusIcon = config.icon;
	const isRunning = step.status === ERecipeStepStatus.RUNNING;

	const duration = step.startedAt && step.finishedAt ? `${((step.finishedAt - step.startedAt) / 1000).toFixed(1)}s` : null;

	return (
		<Collapsible.Root open={expanded} onOpenChange={(o) => setExpanded(o.open)}>
			<Box borderRadius="lg" bg="var(--wc-bg-surface)" borderWidth="1px" borderColor="var(--wc-border-subtle)" overflow="hidden">
				<Flex px="3" py="2" align="center" justify="space-between" cursor="pointer" onClick={() => setExpanded(!expanded)} _hover={{ bg: 'var(--wc-bg-surface)' }}>
					<HStack gap="3" flex="1">
						<Box color="var(--wc-text-faint)">
							{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
						</Box>
						<Box color={config.color}>
							<StatusIcon size={14} className={isRunning ? 'spin' : undefined} style={isRunning ? { animation: 'spin 1.5s linear infinite' } : undefined} />
						</Box>
						<Text fontSize="13px" fontWeight="500" color="var(--wc-text-primary)">{step.name}</Text>
						<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-bg-interactive)" color={config.color} fontSize="10px" fontWeight="600">{config.label}</Badge>
						{step.exitCode !== undefined && step.exitCode !== 0 && (
							<Badge size="sm" px="1.5" py="0.5" borderRadius="full" bg="var(--wc-accent-red-bg-8)" color="var(--wc-accent-red)" fontSize="10px" fontWeight="600">exit {step.exitCode}</Badge>
						)}
					</HStack>
					<HStack gap="2">
						{duration && (
							<Text fontSize="11px" color="var(--wc-text-muted)" fontFamily='"Geist Mono", monospace'>{duration}</Text>
						)}
					</HStack>
				</Flex>
				<Collapsible.Content>
					<Box bg="var(--wc-bg-page)" borderTopWidth="1px" borderColor="var(--wc-border-subtle)" maxH="400px" overflowY="auto" px="3" py="2" fontFamily='"Geist Mono", monospace' fontSize="11px" lineHeight="1.6" onScroll={(e) => {
						const el = e.currentTarget;
						const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
						setAutoScroll(atBottom);
					}}>
						{output.length === 0 ? (
							<Text color="var(--wc-text-placeholder)">No output yet...</Text>
						) : (
							<Text color="var(--wc-text-secondary)" whiteSpace="pre-wrap" wordBreak="break-all">{output}</Text>
						)}
						<Box ref={outputEndRef} />
					</Box>
				</Collapsible.Content>
			</Box>
		</Collapsible.Root>
	);
}
