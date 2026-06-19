import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from '../lib/types';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { Box, Text, VStack, Flex } from '@chakra-ui/react';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
import type { ITodoItem, IGuardrail } from '@warpcore/shared';
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
	console.log('[FEApplet] Started');

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
			server: { type: 'string', description: 'Server ID', index: 1 },
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

	api.eventNode.hook('../', 'bridge.preCompletion', async (eventApi) => {
		const payload = eventApi.payload as { slashCommands: Array<{ name: string }> };
		const guardrailCommands = ['create_guardrail', 'guardrail', 'delete_guardrail'];
		for (const cmd of payload.slashCommands) {
			if (guardrailCommands.includes(cmd.name)) {
				return false;
			}
		}
		return eventApi.result;
	});
};

export const FEApplet: TAppletDefinition<IAppletAPIFE> = {
	name: 'FEApplet',
	description: 'Frontend applet',
	fn,
	hostType: EAppletHostType.FE,
	scope: EAppletScope.THREAD,
};
