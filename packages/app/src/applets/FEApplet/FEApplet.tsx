import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from '../lib/types';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { Box, Text, VStack, Flex, Spinner, Badge, AccordionRoot, AccordionItem as AccordionItemComp, AccordionItemTrigger, AccordionItemContent, HStack, Tabs } from '@chakra-ui/react';
import { ChevronDown, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
import type { ITodoItem, IGuardrail, IGuardrailIssue } from '@warpcore/shared';
import { EGuardrailIssueType } from '@warpcore/shared';
import React from 'react';

const EMPTY_TODOS: ITodoItem[] = [];
const EMPTY_GUARDRAILS: Record<string, IGuardrail> = {};

const TodoPanel = React.memo(() => {
	const threadId = useStore(s => s.currentThreadId);
	const todos = useStore(s => {
		if (!threadId) return EMPTY_TODOS;
		return (s.threadStates[threadId]?.todos as ITodoItem[]) || EMPTY_TODOS;
	});

	const statusStyle = (status: string) => {
		switch (status) {
			case 'done':
				return {
					bg: 'var(--wc-accent-green-bg-8)',
					borderColor: 'var(--wc-accent-green-border)',
					color: 'var(--wc-accent-green)',
				};
			case 'pending':
				return {
					bg: 'var(--wc-accent-yellow-bg-8)',
					borderColor: 'var(--wc-accent-yellow-border)',
					color: 'var(--wc-accent-yellow)',
				};
			case 'postpone':
				return {
					bg: 'var(--wc-bg-subtle)',
					borderColor: 'var(--wc-border-subtle)',
					color: 'var(--wc-text-muted)',
				};
			default:
				return {
					bg: 'var(--wc-bg-subtle)',
					borderColor: 'var(--wc-border-subtle)',
					color: 'var(--wc-text-tertiary)',
				};
		}
	};

	if (!todos.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No todos yet
				</Text>
			</Box>
		);
	}

	return (
		<VStack gap="2" p="3" align="stretch">
			{todos.map((todo, i) => (
				<Box
					key={i}
					borderWidth="1px"
					borderColor="var(--wc-border-subtle)"
					borderRadius="md"
					p="2.5"
					bg="var(--wc-bg-subtle)"
				>
					<Flex gap="2" align="center">
						<Text fontSize="9px" fontWeight="600" color="var(--wc-text-faint)" minW="1.2em">
							{i}
						</Text>
						<Text fontSize="xs" color="var(--wc-text-primary)" flex="1" textOverflow="ellipsis" overflow="hidden">
							{todo.text}
						</Text>
						<Text
							fontSize="9px"
							fontWeight="600"
							letterSpacing="0.04em"
							textTransform="uppercase"
							px="1.5"
							py="0.5"
							borderRadius="sm"
							borderWidth="1px"
							{...statusStyle(todo.status)}
						>
							{todo.status}
						</Text>
					</Flex>
				</Box>
			))}
		</VStack>
	);
});

const CompactIndicator = React.memo(({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
	const messageId = useAuiState(s => s.message.id);
	const slashCommands = useStore(s => s.messageStates[messageId]?.slashCommands);
	const hasCompact = (slashCommands as Array<IExtractedSlashCommand> | undefined)?.some(cmd => cmd.name === 'compact');

	if (!hasCompact) return children;
	return (
		<>
			<Box display="flex" alignItems="center" gap="2" mb="2">
				<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
				<Text fontSize="xs" fontWeight="600" color="var(--wc-accent-yellow-glow)" letterSpacing="0.1em">
					COMPACTION
				</Text>
				<Box flex="1" borderTopWidth="2px" borderColor="var(--wc-accent-yellow-glow)" />
			</Box>
			{children}
		</>
	);
});

const GuardrailsPanel = React.memo(() => {
	const threadId = useStore(s => s.currentThreadId);
	const guardrails = useStore(s => {
		if (threadId) {
			return (s.threadStates[threadId]?.guardrails as Record<string, IGuardrail>) || EMPTY_GUARDRAILS;
		}
		return (s.tempThreadState?.guardrails as Record<string, IGuardrail>) || EMPTY_GUARDRAILS;
	});
	const items = Object.values(guardrails);

	if (!items.length) {
		return (
			<Box p="4">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center">
					No guardrails
				</Text>
			</Box>
		);
	}

	return (
		<VStack gap="2" p="3" align="stretch">
			{items.map(g => (
				<Box key={g.name} borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="md" p="2.5" bg="var(--wc-bg-subtle)">
					<Flex justifyContent="space-between" mb="1.5">
						<Text fontSize="xs" fontWeight="600" color="var(--wc-text-primary)">{g.name}</Text>
						<Text fontSize="9px" fontWeight="600" letterSpacing="0.04em" textTransform="uppercase"
							px="1.5" py="0.5" borderRadius="sm" borderWidth="1px"
							color={g.active ? 'var(--wc-accent-green)' : 'var(--wc-text-muted)'}
							bg={g.active ? 'var(--wc-accent-green-bg-8)' : 'var(--wc-bg-subtle)'}
							borderColor={g.active ? 'var(--wc-accent-green-border)' : 'var(--wc-border-subtle)'}>
							{g.active ? 'ACTIVE' : 'INACTIVE'}
						</Text>
					</Flex>
					<Text fontSize="9px" color="var(--wc-text-muted)">Server: {g.serverId} · SubRole: {g.subRoleSelection}</Text>
					{g.prompt && <Text fontSize="9px" color="var(--wc-text-tertiary)" textOverflow="ellipsis" overflow="hidden" mt="1">{g.prompt}</Text>}
				</Box>
			))}
		</VStack>
	);
});

const GuardrailResults = React.memo(({ def, children }: { def: TUiSpaceComponentDef; children: React.ReactNode }) => {
	const messageId = useAuiState(s => s.message.id);
	const role = useAuiState(s => s.message.role);
	const results = useStore(s => s.messageStates[messageId]?.guardrailResults) as Record<string, IGuardrailIssue[] | boolean>;

	if (role !== 'assistant' || !results) return children;

	const entries = Object.entries(results);
	const processingCount = entries.filter(([, v]) => v === false).length;
	const doneEntries = entries.filter(([, v]) => Array.isArray(v));
	const totalViolations = doneEntries.reduce((acc, [, items]) => acc + (items as IGuardrailIssue[]).filter(i => i.type === EGuardrailIssueType.VIOLATION).length, 0);
	const totalWarnings = doneEntries.reduce((acc, [, items]) => acc + (items as IGuardrailIssue[]).filter(i => i.type === EGuardrailIssueType.WARNING).length, 0);
	const allClear = doneEntries.length === entries.length && totalViolations === 0 && totalWarnings === 0;

	return (
		<>
			{children}
			<Box mt="2">
				<AccordionRoot collapsible defaultValue={['guardrails']}>
					<AccordionItemComp value="guardrails" borderRadius="6px" borderWidth="1px" borderColor="var(--wc-border-subtle)">
						<AccordionItemTrigger
							style={{
								borderRadius: '6px 6px 0 0',
								background: 'var(--wc-bg-card)',
								border: 'none',
								cursor: 'pointer',
								display: 'flex',
								justifyContent: 'space-between',
								alignItems: 'center',
								width: '100%',
							}}
							p="2.5"
							_hover={{ bg: 'var(--wc-bg-subtle)' }}
							css={{ '&[data-state=open] .chevron': { transform: 'rotate(180deg)' } }}
						>
							<HStack gap="2">
								{processingCount > 0 && <Spinner size="xs" color="var(--wc-text-muted)" />}
								{totalViolations > 0 && <XCircle size={14} color="var(--wc-accent-red)" />}
								{totalWarnings > 0 && <AlertTriangle size={14} color="var(--wc-accent-yellow)" />}
								{allClear && <CheckCircle size={14} color="var(--wc-accent-green)" />}
								<Text fontSize="xs" fontWeight="500" color="var(--wc-text-primary)">
									Guardrails
								</Text>
								{totalViolations > 0 && (
									<Badge color="var(--wc-accent-red)" bg="var(--wc-accent-red-bg-8)" px="1.5" py="0.5" fontSize="9px">{totalViolations}V</Badge>
								)}
								{totalWarnings > 0 && (
									<Badge color="var(--wc-accent-yellow)" bg="var(--wc-accent-yellow-bg-8)" px="1.5" py="0.5" fontSize="9px">{totalWarnings}W</Badge>
								)}
								{processingCount > 0 && (
									<Badge color="var(--wc-text-muted)" bg="var(--wc-bg-subtle)" px="1.5" py="0.5" fontSize="9px">{processingCount}...</Badge>
								)}
							</HStack>
							<ChevronDown size={14} color="var(--wc-text-muted)" className="chevron" css={{ transition: 'transform 0.15s ease' }} />
						</AccordionItemTrigger>
						<AccordionItemContent>
							{entries.length > 1 ? (
								<Tabs.Root defaultValue={entries[0]?.[0] || ''}>
									<Tabs.List gap="0" borderBottomWidth="1px" borderColor="var(--wc-border-subtle)">
										{entries.map(([name]) => (
											<Tabs.Trigger key={name} value={name} fontSize="xs" fontWeight="500" px="3" py="2" color="var(--wc-text-muted)">
												{name}
											</Tabs.Trigger>
										))}
										<Tabs.Indicator />
									</Tabs.List>
									{entries.map(([name, result]) => (
										<Tabs.Content key={name} value={name} p="2.5">
											{result === false
												? <HStack gap="2"><Spinner size="xs" /><Text fontSize="xs" color="var(--wc-text-muted)">Processing...</Text></HStack>
												: (result as IGuardrailIssue[]).length === 0
													? <Text fontSize="xs" color="var(--wc-accent-green)">All clear</Text>
													: <VStack gap="2" align="stretch">
														{(result as IGuardrailIssue[]).map((item, i) => (
															<GuardrailIssueItem key={i} item={item} />
														))}
													</VStack>
											}
										</Tabs.Content>
									))}
								</Tabs.Root>
							) : (
								<Box p="2.5">
									{(() => {
										const [name, result] = entries[0];
										if (result === false) return <HStack gap="2"><Spinner size="xs" /><Text fontSize="xs" color="var(--wc-text-muted)">Processing {name}...</Text></HStack>;
										const items = result as IGuardrailIssue[];
										if (items.length === 0) return <Text fontSize="xs" color="var(--wc-accent-green)">{name} — All clear</Text>;
										return (
											<VStack gap="2" align="stretch">
												{items.map((item, i) => (
													<GuardrailIssueItem key={i} item={item} />
												))}
											</VStack>
										);
									})()}
								</Box>
							)}
						</AccordionItemContent>
					</AccordionItemComp>
				</AccordionRoot>
			</Box>
		</>
	);
});

const GuardrailIssueItem = React.memo(({ item }: { item: IGuardrailIssue }) => (
	<Box p="2" borderRadius="md" bg="var(--wc-bg-subtle)" borderWidth="1px"
		borderColor={item.type === EGuardrailIssueType.VIOLATION ? 'var(--wc-accent-red-border)' : 'var(--wc-accent-yellow-border)'}>
		<Flex justifyContent="space-between" mb="1">
			<Text fontSize="9px" fontWeight="600" textTransform="uppercase" letterSpacing="0.04em"
				color={item.type === EGuardrailIssueType.VIOLATION ? 'var(--wc-accent-red)' : 'var(--wc-accent-yellow)'}>
				{item.type}
			</Text>
			<Text fontSize="xs" color="var(--wc-text-primary)">{item.issue}</Text>
		</Flex>
		<Text fontSize="9px" color="var(--wc-text-tertiary)" fontStyle="italic" textOverflow="ellipsis" overflow="hidden">
			{item.quote}
		</Text>
	</Box>
));

const registerGuardrailChip = (api: IAppletAPIFE, name: string) => {
	api.registerComposerChip({
		componentId: `guardrail-${name}`,
		selectLabel: () => name,
		selectIsActive: (s) => {
			const threadId = s.currentThreadId;
			const guardrails = (threadId ? s.threadStates[threadId]?.guardrails : s.tempThreadState?.guardrails) as Record<string, IGuardrail>;
			return guardrails?.[name]?.active ?? false;
		},
		onSetIsActive: (active) => {
			const state = api.useStore.getState();
			const threadId = state.currentThreadId;
			const guardrails = (threadId ? state.threadStates[threadId]?.guardrails : state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
			if (!guardrails[name]) return;
			state.setThreadState(threadId, { guardrails: { ...guardrails, [name]: { ...guardrails[name], active } } });
		},
		onClose: () => {
			const state = api.useStore.getState();
			const threadId = state.currentThreadId;
			const guardrails = (threadId ? state.threadStates[threadId]?.guardrails : state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
			if (!guardrails[name]) return;
			state.setThreadState(threadId, { guardrails: { ...guardrails, [name]: { ...guardrails[name], active: false } } });
		},
	});
};

const fn: IAppletFn<IAppletAPIFE> = async (api) => {
	console.log('[FEApplet] Started!');

	api.onReady(() => {
		console.log("[FEApplet] OnReady!");

		api.registerSlashCommand({
			name: 'testfe',
			description: 'Test FE command with target and count params',
			params: {
				target: { type: 'string', description: 'Target name', index: 0 },
				count: { type: 'number', description: 'Count value', index: 1 },
			},
			execute: async (api, params) => { console.log('[FEApplet] /testfe executed', params); },
		});

		api.registerSlashCommand({
			name: 'compact',
			description: 'Compact the conversation thread. Add a message in chat for custom instructions.',
			params: {},
			execute: async (api, params) => { console.log('[FEApplet] /compact executed'); },
		});

		api.registerSlashCommand({
			name: 'create_guardrail',
			description: 'Create a custom guardrail',
			params: {
				name: { type: 'string', description: 'Guardrail name', index: 0 },
				server: { type: 'server', description: 'Server ID', index: 1 },
				prompt: { type: 'string', description: 'Review prompt', index: 2 },
				subrole: { type: 'string', description: 'all/text/tool', index: 3 },
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const subroleMap: Record<string, string> = { all: 'all', text: 'text', tool: 'tool' };
				const subRole = subroleMap[params.subrole as string] || 'all';
				const guardrails = (threadId ? state.threadStates[threadId]?.guardrails : state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
				state.setThreadState(threadId, { guardrails: { ...guardrails, [params.name!]: {
					name: params.name,
					serverId: params.server,
					active: true,
					type: 'custom',
					prompt: params.prompt,
					subRoleSelection: subRole,
				} } });
				registerGuardrailChip(api, params.name as string);
			},
		});
		api.registerSlashCommand({
			name: 'guardrail',
			description: 'Activate or deactivate a guardrail',
			params: {
				name: { type: 'string', description: 'Guardrail name', index: 0 },
				action: { type: 'string', description: 'on/off', index: 1 },
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const guardrails = (threadId ? state.threadStates[threadId]?.guardrails : state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
				if (!guardrails[params.name!]) return;
				state.setThreadState(threadId, { guardrails: { ...guardrails, [params.name!]: { ...guardrails[params.name!], active: params.action === 'on' } } });
			},
		});
		api.registerSlashCommand({
			name: 'delete_guardrail',
			description: 'Delete a custom guardrail',
			params: {
				name: { type: 'string', description: 'Guardrail name', index: 0 },
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const guardrails = (threadId ? state.threadStates[threadId]?.guardrails : state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
				if (!guardrails[params.name!]) return;
				const { [params.name!]: _, ...rest } = guardrails;
				state.setThreadState(threadId, { guardrails: rest });
				state.unregisterUiSpaceComponent('FEApplet', `guardrail-${params.name}`);
			},
		});
		api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, TodoPanel, { label: 'Todo' });
		api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, GuardrailsPanel, { label: 'Guardrails' });
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, CompactIndicator, { label: 'Compact Indicator' });
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, GuardrailResults, { label: 'GuardrailResults' });
		api.registerComposerChip({
			selectLabel: () => 'FEApplet',
			selectIsActive: () => true,
			onSetIsActive: (active) => { console.log('[FEApplet] chip toggled', active); },
			onClose: (id) => { console.log('[FEApplet] chip closed', id); },
		});

		const state = api.useStore.getState();
		const currentThreadId = state.currentThreadId;
		const guardrails = (currentThreadId
			? state.threadStates[currentThreadId]?.guardrails
			: state.tempThreadState?.guardrails) as Record<string, IGuardrail> || {};
		for (const g of Object.values(guardrails)) {
			if (g.active) {
				registerGuardrailChip(api, g.name);
			}
		}

		api.eventNode.hook('..', 'bridge.preCompletion', async (eventApi) => {
			const payload = eventApi.payload as { slashCommands: Array<{ name: string }> };
			const guardrailCommands = ['create_guardrail', 'guardrail', 'delete_guardrail'];
			for (const cmd of payload.slashCommands) {
				if (guardrailCommands.includes(cmd.name)) {
					return false;
				}
			}
			return eventApi.result;
		});

	});
};

export const FEApplet: TAppletDefinition<IAppletAPIFE> = {
	name: 'FEApplet',
	description: 'Frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
