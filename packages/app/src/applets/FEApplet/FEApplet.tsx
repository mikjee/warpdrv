import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from '../lib/types';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { Box, Text, VStack, Flex } from '@chakra-ui/react';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
import type { ITodoItem } from '@warpcore/shared';
import React from 'react';

const EMPTY: ITodoItem[] = [];

const TodoPanel = React.memo(() => {
	const threadId = useStore(s => s.currentThreadId);
	const todos = useStore(s => {
		if (!threadId) return EMPTY;
		return (s.threadStates[threadId]?.todos as ITodoItem[]) || EMPTY;
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
						<Text fontSize="xs" color="var(--wc-text-primary)" flex="1" noWrap textOverflow="ellipsis" overflow="hidden">
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
		name: 'testecho',
		description: 'Echo back whatever you type as a test',
		params: {
			message: { type: 'string', description: 'Message to echo', index: 0 },
		},
		execute: async (api, params) => { console.log('[FEApplet] /testecho executed', params); },
	});
	api.registerSlashCommand({
		name: 'compact',
		description: 'Compact the conversation thread',
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
			const threadId = api.useStore.getState().currentThreadId;
			if (!threadId) return;
			const subroleMap: Record<string, string> = { all: 'all', text: 'text', tool: 'tool' };
			const subRole = subroleMap[params.subrole as string] || 'all';
			api.useStore.getState().setThreadState(threadId, {
				guardrails: { [params.name]: {
					name: params.name,
					serverId: params.server,
					active: true,
					type: 'custom',
					prompt: params.prompt,
					subRoleSelection: subRole,
				} },
			});
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
			const threadId = api.useStore.getState().currentThreadId;
			if (!threadId) return;
			const state = api.useStore.getState();
			const guardrails = state.threadStates[threadId]?.guardrails as Record<string, any> || {};
			if (!guardrails[params.name]) return;
			guardrails[params.name].active = params.action === 'on';
			state.setThreadState(threadId, { guardrails });
		},
	});
	api.registerSlashCommand({
		name: 'delete_guardrail',
		description: 'Delete a custom guardrail',
		params: {
			name: { type: 'string', description: 'Guardrail name', index: 0 },
		},
		execute: async (_api, params) => {
			const threadId = api.useStore.getState().currentThreadId;
			if (!threadId) return;
			const state = api.useStore.getState();
			const guardrails = state.threadStates[threadId]?.guardrails as Record<string, any> || {};
			if (!guardrails[params.name]) return;
			delete guardrails[params.name];
			state.setThreadState(threadId, { guardrails });
		},
	});
	api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, TodoPanel, { label: 'Todo' });
	api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, CompactIndicator, { label: 'Compact Indicator' });
	api.registerComposerChip({
		label: 'FEApplet',
		isActive: true,
		onClose: (id) => { console.log('[FEApplet] chip closed', id); },
	});

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
