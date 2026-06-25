import type { TAppletDefinition, IAppletFn } from '@warpcore/realmcore';
import { EAppletHostType, EAppletScope } from '@warpcore/realmcore';
import { EUISpaceLoc } from '@/store/slices/uiSpaces';
import type { IAppletAPIFE } from '../lib/types';
import type { TUiSpaceComponentDef } from '@/store/slices/uiSpaces';
import { Box, Text, VStack, Flex, Spinner, Badge, AccordionRoot, AccordionItem as AccordionItemComp, AccordionItemTrigger, AccordionItemContent, HStack, Tabs, Switch, Input, Textarea, Button, SegmentGroup } from '@chakra-ui/react';
import { ChevronDown, CheckCircle, AlertTriangle, XCircle, ChevronRight, Edit2, Trash2, Check } from 'lucide-react';
import { FaShieldAlt } from 'react-icons/fa';
import { LuListTodo } from 'react-icons/lu';
import { MdDragHandle } from 'react-icons/md';
import { useAuiState } from '@assistant-ui/react';
import { useStore } from '@/store';
import type { IExtractedSlashCommand } from '@/pages/Chat/assistant-ui/docToString';
import type { ITodoItem, IGuardrail, IGuardrailIssue } from '@warpcore/shared';
import { EGuardrailIssueType } from '@warpcore/shared';
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { TDropdownItem } from '@/pages/Chat/assistant-ui/slash-command/SlashCmdDropdown';
import React from 'react';
import { useDependantState } from '@/hooks/useDependantState';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { ServerPicker } from '@/components/ServerPicker';
import { TbMessage2Plus } from 'react-icons/tb';

const EMPTY_TODOS: ITodoItem[] = [];
const EMPTY_GUARDRAILS: Record<string, IGuardrail> = {};

function useGuardrailItems(): TDropdownItem[] {
  const guardrails = useStore(s => {
    const ts = s.getCurrentThreadState(s);
    return ts?.guardrails as Record<string, IGuardrail>;
  });
  return useMemo(() => guardrails ? Object.keys(guardrails).map(n => ({ label: n, value: n })) : [], [guardrails]);
}

const TodoPanel = React.memo(() => {
	const threadId = useStore(s => s.currentThreadId);
	const todos = useStore(s => {
		if (!threadId) return EMPTY_TODOS;
		return (s.threadStates[threadId]?.todos as ITodoItem[]) || EMPTY_TODOS;
	});
	const setThreadState = useStore(s => s.setThreadState);
	const annotations = useStore(s => s.annotations);
	const addAnnotation = useStore(s => s.addAnnotation);
	const removeAnnotation = useStore(s => s.removeAnnotation);

	const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
	const [addText, setAddText] = useState('');
	const [draftText, setDraftText] = useState('');
	const editRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editingIndex !== null) {
			setDraftText(todos[editingIndex]?.text || '');
		}
	}, [editingIndex, todos]);

	const addTodoAnnotation = useCallback((updatedTodos: ITodoItem[]) => {
		const existing = annotations.find(a => a.selectedText.startsWith('<todos>'));
		if (existing) removeAnnotation(existing.id);
		const formatted = updatedTodos.map((t, i) => `${i + 1}. ${t.text} ${t.status === 'done' ? '[DONE]' : '[PENDING]'}`).join('\\n');
		addAnnotation(`<todos>\\n${formatted}\\n</todos>`, 'Updated Todos');
	}, [annotations, addAnnotation, removeAnnotation]);

	const toggleDone = useCallback((index: number) => {
		const updated = todos.map((t, j) =>
			j === index ? { ...t, status: t.status === 'done' ? 'pending' : 'done' } : t
		);
		setThreadState(threadId, { todos: updated });
		addTodoAnnotation(updated);
	}, [todos, setThreadState, threadId, addTodoAnnotation]);

	const startEdit = useCallback((index: number) => {
		setEditingIndex(index);
		setTimeout(() => editRef.current?.focus(), 0);
	}, []);

	const saveEdit = useCallback(() => {
		if (editingIndex === null) return;
		const trimmed = draftText.trim();
		if (!trimmed) {
			setEditingIndex(null);
			return;
		}
		const updated = todos.map((t, j) =>
			j === editingIndex ? { ...t, text: trimmed } : t
		);
		setThreadState(threadId, { todos: updated });
		setEditingIndex(null);
		addTodoAnnotation(updated);
	}, [editingIndex, draftText, todos, setThreadState, threadId, addTodoAnnotation]);

	const cancelEdit = useCallback(() => {
		setEditingIndex(null);
	}, []);

	const deleteTodo = useCallback((index: number) => {
		const updated = todos.filter((_, j) => j !== index);
		setThreadState(threadId, { todos: updated });
		setDeleteConfirm(null);
		addTodoAnnotation(updated);
	}, [todos, setThreadState, threadId, addTodoAnnotation]);

	const addTodo = useCallback(() => {
		const trimmed = addText.trim();
		if (!trimmed) return;
		const newTodos = [...todos, { text: trimmed, status: 'pending' }];
		setThreadState(threadId, { todos: newTodos });
		setAddText('');
		addTodoAnnotation(newTodos);
	}, [addText, todos, setThreadState, threadId, addTodoAnnotation]);

	const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
		setDraggingIndex(index);
		e.dataTransfer.setData('index', String(index));
		e.dataTransfer.effectAllowed = 'move';
	}, []);

	const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
		e.preventDefault();
		e.dataTransfer.dropEffect = 'move';
		setDragOverIndex(index);
	}, []);

	const handleDrop = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		const fromIndex = parseInt(e.dataTransfer.getData('index'), 10);
		if (draggingIndex === null || isNaN(fromIndex)) {
			setDraggingIndex(null);
			setDragOverIndex(null);
			return;
		}
		const toIndex = dragOverIndex !== null ? dragOverIndex : todos.length;
		const updated = [...todos];
		const [item] = updated.splice(fromIndex, 1);
		updated.splice(toIndex, 0, item);
		setThreadState(threadId, { todos: updated });
		setDraggingIndex(null);
		setDragOverIndex(null);
		addTodoAnnotation(updated);
	}, [draggingIndex, dragOverIndex, todos, setThreadState, threadId, addTodoAnnotation]);

	const handleDragEnd = useCallback(() => {
		setDraggingIndex(null);
		setDragOverIndex(null);
	}, []);

	if (!todos.length) {
		return (
			<Box p="3">
				<Text fontSize="xs" color="var(--wc-text-muted)" textAlign="center" mb="2">
					No todos yet
				</Text>
				<Input
					size="xs"
					fontSize="xs"
					value={addText}
					onChange={(e) => setAddText(e.target.value)}
					onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
					placeholder="Add todo..."
				/>
			</Box>
		);
	}

	return (
		<VStack gap="3" p="2" align="stretch">
			{todos.map((todo, i) => (
				<Box
					key={i}
					borderWidth="2px"
					borderColor={dragOverIndex === i ? 'var(--wc-accent-blue-border)' : 'transparent'}
					// borderRadius="md"
					// p="2"
					// py="1"
					// bg="var(--wc-bg-subtle)"
					opacity={draggingIndex === i ? 0.6 : 1}
					draggable
					onDragStart={(e) => handleDragStart(e, i)}
					onDragOver={(e) => handleDragOver(e, i)}
					onDragLeave={() => setDragOverIndex(null)}
					onDrop={handleDrop}
					onDragEnd={handleDragEnd}
				>
					<Flex gap="1.5" align="center">
						<Box
							cursor="pointer"
							flexShrink={0}
							display="flex"
							alignItems="center"
							justifyContent="center"
							w="14px"
							h="14px"
							borderWidth="1px"
							borderColor={todo.status === 'done' ? 'var(--wc-accent-green)' : 'var(--wc-border-default)'}
							borderRadius="sm"
							bg="transparent"
							mr="1"
							onClick={() => toggleDone(i)}
						>
							{todo.status === 'done' && <Check size={12} strokeWidth={3} color="var(--wc-accent-green)" />}
						</Box>

						<Text fontSize="xs" fontWeight="600" color="var(--wc-text-faint)" flexShrink={0}>
							{i}.
						</Text>

						{editingIndex === i ? (
							<Flex gap="1" flex="1" minW="0" align="center">
								<Input
									ref={editRef}
									size="xs"
									fontSize="xs"
									flex="1"
									minW="0"
									value={draftText}
									onChange={(e) => setDraftText(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') saveEdit();
										if (e.key === 'Escape') cancelEdit();
									}}
									onBlur={saveEdit}
								/>
								<Box cursor="pointer" onClick={saveEdit}>
									<Check size={12} color="var(--wc-text-muted)" />
								</Box>
								<Box cursor="pointer" onClick={cancelEdit}>
									<XCircle size={12} color="var(--wc-text-muted)" />
								</Box>
							</Flex>
						) : (
							<>
								<Text
									fontSize="xs"
									color={todo.status === 'done' ? 'var(--wc-text-muted)' : 'var(--wc-text-primary)'}
									textDecoration={todo.status === 'done' ? 'line-through' : 'none'}
									flex="1"
									minW="0"
									overflow="hidden"
									textOverflow="ellipsis"
									whiteSpace="nowrap"
								>
									{todo.text}
								</Text>
								<Box
									cursor="grab"
									_hover={{ color: 'var(--wc-text-primary)' }}
									flexShrink={0}
									display="flex"
									alignItems="center"
									px="0.5"
								>
									<MdDragHandle size={15} color="var(--wc-text-muted)" />
								</Box>
								<Box
									w="1px"
									h="12px"
									bg="var(--wc-border-subtle)"
									flexShrink={0}
									mx="1"
								/>
								<Box
									cursor="pointer"
									_hover={{ color: 'var(--wc-text-primary)' }}
									onClick={() => startEdit(i)}
								>
									<Edit2 size={12} color="var(--wc-text-muted)" />
								</Box>
								<Box
									cursor="pointer"
									_hover={{ color: 'var(--wc-accent-red)' }}
									onClick={() => setDeleteConfirm(i)}
									ml="2"
								>
									<Trash2 size={12} color="var(--wc-accent-red)" />
								</Box>
							</>
						)}
					</Flex>
				</Box>
			))}

			<Input
				size="xs"
				fontSize="xs"
				value={addText}
				onChange={(e) => setAddText(e.target.value)}
				onKeyDown={(e) => { if (e.key === 'Enter') addTodo(); }}
				placeholder="Add todo..."
			/>

			{deleteConfirm !== null && (
				<ConfirmDialog
					title="Delete Todo"
					message={`Are you sure you want to delete "${todos[deleteConfirm]?.text}"?`}
					isOpen={true}
					onConfirm={() => deleteTodo(deleteConfirm)}
					onCancel={() => setDeleteConfirm(null)}
					confirmLabel="Delete"
				/>
			)}
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

const GuardrailRow = React.memo(({ guardrail }: { guardrail: IGuardrail }) => {
	const [expanded, setExpanded] = useState(false);
	const [editingName, setEditingName] = useState(false);
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
	const [draftName, setDraftName] = useDependantState(guardrail.name);
	const [draftPrompt, setDraftPrompt] = useDependantState(guardrail.prompt || '');
	const [draftMessagesCount, setDraftMessagesCount] = useDependantState(guardrail.messagesCount ?? 0);
	const nameSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const promptSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateGuardrail = useCallback((patch: Partial<IGuardrail>) => {
		const state = useStore.getState();
		const threadId = state.currentThreadId;
		const ts = state.getCurrentThreadState(state);
		const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
		if (!guardrails[guardrail.name]) return;
		state.setThreadState(threadId, { guardrails: { ...guardrails, [guardrail.name]: { ...guardrails[guardrail.name], ...patch } } });
	}, [guardrail.name]);

	const flushName = useCallback(() => {
		if (draftName === guardrail.name) return;
		const state = useStore.getState();
		const threadId = state.currentThreadId;
		const ts = state.getCurrentThreadState(state);
		const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
		if (!guardrails[guardrail.name]) return;
		const { [guardrail.name]: oldEntry, ...rest } = guardrails;
		const updatedEntry = { ...oldEntry, name: draftName };
		state.setThreadState(threadId, { guardrails: { ...rest, [draftName]: updatedEntry } });
	}, [draftName, guardrail.name]);

	const handleNameBlur = useCallback(() => {
		setEditingName(false);
		if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
		nameSaveTimerRef.current = setTimeout(flushName, 200);
	}, [flushName]);

	const flushPrompt = useCallback(() => {
		updateGuardrail({ prompt: draftPrompt });
	}, [draftPrompt, updateGuardrail]);

	const handlePromptBlur = useCallback(() => {
		if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		promptSaveTimerRef.current = setTimeout(flushPrompt, 200);
	}, [flushPrompt]);

	useEffect(() => {
		return () => {
			if (nameSaveTimerRef.current) clearTimeout(nameSaveTimerRef.current);
			if (promptSaveTimerRef.current) clearTimeout(promptSaveTimerRef.current);
		};
	}, []);

	const handleDelete = () => {
		const state = useStore.getState();
		const threadId = state.currentThreadId;
		const ts = state.getCurrentThreadState(state);
		const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
		if (!guardrails[guardrail.name]) return;
		const { [guardrail.name]: _, ...rest } = guardrails;
		state.setThreadState(threadId, { guardrails: rest });
	};

	return (
		<Box borderWidth="1px" borderColor="var(--wc-border-subtle)" borderRadius="md" bg="var(--wc-bg-subtle)" overflow="hidden">
			<Flex align="center" gap="2" p="2.5" cursor="pointer" onClick={() => setExpanded(!expanded)}>
				{expanded ? <ChevronDown size={14} color="var(--wc-text-muted)" /> : <ChevronRight size={14} color="var(--wc-text-muted)" />}
				{editingName ? (
					<Input
						size="xs"
						fontSize="xs"
						fontWeight="600"
						value={draftName}
						onChange={(e) => setDraftName(e.target.value)}
						onBlur={handleNameBlur}
						onKeyDown={(e) => { if (e.key === 'Enter') handleNameBlur(); }}
						onClick={(e) => e.stopPropagation()}
						flex="1"
						minW="0"
					/>
				) : (
					<Flex align="center" gap="1.5" flex="1" minW="0">
						<Text fontSize="xs" fontWeight="600" color="var(--wc-text-primary)" textOverflow="ellipsis" overflow="hidden">
							{draftName}
						</Text>
						
						<Edit2
							size={10}
							color="var(--wc-text-faint)"
							style={{ cursor: 'pointer', flexShrink: 0 }}
							onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
						/>
					</Flex>
				)}

				<Switch.Root
					size="sm"
					checked={guardrail.isActive}
					onCheckedChange={(details) => updateGuardrail({ isActive: details.checked })}
					onClick={(e) => e.stopPropagation()}
				>
					<Switch.HiddenInput />
					<Switch.Control css={{ bg: guardrail.isActive ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
						<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
					</Switch.Control>
				</Switch.Root>

				</Flex>

			{expanded && (
				<VStack gap="2.5" px="2.5" pb="2.5" pt="0" align="stretch" opacity={guardrail.isActive ? 1 : 0.4}>
					<Box>
						<Text fontSize="9px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.04em" mb="1">
							Server
						</Text>
						<ServerPicker value={guardrail.serverId} onChange={(id) => updateGuardrail({ serverId: id })} />
					</Box>

					<Box>
						<Text fontSize="9px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.04em" mb="1">
							Trigger only on tool calls
						</Text>
						<Input
							size="xs"
							fontSize="xs"
							value={guardrail.triggerOnTools || ''}
							onChange={(e) => updateGuardrail({ triggerOnTools: e.target.value })}
							placeholder="Comma-separated tool names"
						/>
					</Box>

					<Flex gap="2" align="center">
						<Switch.Root
							size="sm"
							checked={guardrail.inferenceParams?.enableThinking as boolean}
							onCheckedChange={(details) => {
								const newParams = { ...(guardrail.inferenceParams || {}), enableThinking: details.checked };
								updateGuardrail({ inferenceParams: newParams });
							}}
							onClick={(e) => e.stopPropagation()}
						>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: (guardrail.inferenceParams?.enableThinking as boolean) ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
						</Switch.Root>
						<Text fontSize="xs" color="var(--wc-text-primary)">Enable thinking</Text>
					</Flex>

					{!!guardrail.inferenceParams?.enableThinking && (
						<Box>
							<Text fontSize="9px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.04em" mb="1">
								Reasoning effort
							</Text>
							<SegmentGroup.Root value={guardrail.inferenceParams?.reasoningEffort as string || 'medium'} onValueChange={(details) => {
								const newParams = { ...(guardrail.inferenceParams || {}), reasoningEffort: details.value };
								updateGuardrail({ inferenceParams: newParams });
							}}>
								<SegmentGroup.Indicator />
								<SegmentGroup.Items items={["low", "medium", "high"]} />
							</SegmentGroup.Root>
						</Box>
					)}

					<Flex gap="2" align="center">
						<Switch.Root
							size="sm"
							checked={guardrail.includeBaseMessage ?? false}
							onCheckedChange={(details) => updateGuardrail({ includeBaseMessage: details.checked })}
							onClick={(e) => e.stopPropagation()}
						>
							<Switch.HiddenInput />
							<Switch.Control css={{ bg: (guardrail.includeBaseMessage ?? false) ? 'var(--wc-switch-active)' : 'var(--wc-bg-active)' }}>
								<Switch.Thumb css={{ bg: 'var(--wc-special-switch-thumb)' }} />
							</Switch.Control>
						</Switch.Root>
						<Text fontSize="xs" color="var(--wc-text-primary)">Include root message</Text>
					</Flex>

					<Box>
						<Text fontSize="9px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.04em" mb="1">
							Include previous n messages
						</Text>
						<Input
							size="xs"
							fontSize="xs"
							type="number"
							min={0}
							value={draftMessagesCount}
							onChange={(e) => setDraftMessagesCount(Number(e.target.value))}
							onBlur={() => updateGuardrail({ messagesCount: draftMessagesCount })}
						/>
					</Box>

					<Box>
						<Text fontSize="9px" fontWeight="600" color="var(--wc-text-muted)" textTransform="uppercase" letterSpacing="0.04em" mb="1">
							Custom Prompt
						</Text>
						<Textarea
							size="xs"
							fontSize="11px"
							value={draftPrompt}
							onChange={(e) => setDraftPrompt(e.target.value)}
							onBlur={handlePromptBlur}
							rows={3}
							resize="vertical"
							placeholder="Custom rules..."
						/>
					</Box>
					
					<Flex justifyContent="flex-end">
						<Button
							size="xs"
							fontSize="10px"
							px="2"
							py="1"
							borderRadius="sm"
							bg="var(--wc-accent-red-bg-8)"
							color="var(--wc-accent-red)"
							borderWidth="1px"
							borderColor="var(--wc-accent-red-border)"
							_hover={{ bg: 'var(--wc-accent-red-hover)' }}
							onClick={() => setDeleteConfirmOpen(true)}
						>
							<Trash2 size={10} style={{ marginRight: '4px' }} />
							Delete
						</Button>
					</Flex>
				</VStack>
			)}

			{deleteConfirmOpen && (
				<ConfirmDialog
					title="Delete Guardrail"
					message={`Are you sure you want to delete "${draftName}"?`}
					isOpen={true}
					onConfirm={handleDelete}
					onCancel={() => setDeleteConfirmOpen(false)}
					confirmLabel="Delete"
				/>
			)}
		</Box>
	);
});

const GuardrailsPanel = React.memo(() => {
	const guardrails = useStore(s => {
		const ts = s.getCurrentThreadState(s);
		return ts?.guardrails || EMPTY_GUARDRAILS;
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
				<GuardrailRow key={g.name} guardrail={g} />
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

	// Collect all issues with guardrail name, violations first then warnings, sorted by name within each group
	const allIssues: Array<{ guardrailName: string; issue: IGuardrailIssue }> = [];
	for (const [name, result] of doneEntries) {
		for (const item of result as IGuardrailIssue[]) {
			allIssues.push({ guardrailName: name, issue: item });
		}
	}
	const violations = allIssues.filter(i => i.issue.type === EGuardrailIssueType.VIOLATION).sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
	const warnings = allIssues.filter(i => i.issue.type === EGuardrailIssueType.WARNING).sort((a, b) => a.guardrailName.localeCompare(b.guardrailName));
	const sortedIssues = [...violations, ...warnings];

	// Processing entries
	const processingEntries = entries.filter(([, v]) => v === false);

	return (
		<>
			{children}
			<Box mt="2">
				<AccordionRoot collapsible defaultValue={totalViolations > 0 ? ['guardrails'] : []}>
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
								<FaShieldAlt size={16} color="var(--wc-text-muted)" />
								<Text fontSize="xs" fontWeight="500" color="var(--wc-text-primary)">
									Guardrails
								</Text>
								{totalViolations > 0 && (
									<Badge color="var(--wc-accent-red)" bg="var(--wc-accent-red-bg-8)" px="1.5" py="0.5" fontSize="11px">{totalViolations} Violations</Badge>
								)}
								{totalWarnings > 0 && (
									<Badge color="var(--wc-accent-yellow)" bg="var(--wc-accent-yellow-bg-8)" px="1.5" py="0.5" fontSize="11px">{totalWarnings} Warnings</Badge>
								)}
								{processingCount > 0 && <Spinner size="xs" color="var(--wc-text-muted)" />}
								{allClear && <CheckCircle size={16} color="var(--wc-accent-green)" />}
							</HStack>
							<HStack gap="2" align="center">
								<ChevronDown size={16} color="var(--wc-text-muted)" className="chevron" css={{ transition: 'transform 0.15s ease' }} />
							</HStack>
						</AccordionItemTrigger>
						<AccordionItemContent>
							<Box p="2.5">
								{allClear
									? <Text fontSize="sm" color="var(--wc-accent-green)">All clear</Text>
									: <VStack gap="2" align="stretch">
										{processingEntries.map(([name]) => (
											<HStack key={name} gap="2">
												<Spinner size="sm" />
												<Text fontSize="sm" color="var(--wc-text-muted)">Processing {name}...</Text>
											</HStack>
										))}
										{sortedIssues.map(({ guardrailName, issue }, i) => (
											<GuardrailIssueItem key={i} guardrailName={guardrailName} item={issue} />
										))}
									</VStack>
								}
							</Box>
						</AccordionItemContent>
					</AccordionItemComp>
				</AccordionRoot>
			</Box>
		</>
	);
});

const GuardrailIssueItem = React.memo(({ guardrailName, item }: { guardrailName: string; item: IGuardrailIssue }) => {
	const addAnnotation = useStore(s => s.addAnnotation);
	const isViolation = item.type === EGuardrailIssueType.VIOLATION;

	return (
		<Box p="2" borderRadius="md" bg="var(--wc-bg-subtle)" borderWidth="1px"
			borderColor={isViolation ? 'var(--wc-accent-red-border)' : 'var(--wc-accent-yellow-border)'}>
			<Flex justifyContent="space-between" align="flex-start" mb={"0.5"}>
				<HStack gap="2" flex="1" minW="0" align={"flex-start"}>
					{isViolation
						? <XCircle size={18} color="var(--wc-accent-red)" style={{ marginTop: "3px" }}/>
						: <AlertTriangle size={18} color="var(--wc-accent-yellow)" style={{ marginTop: "3px" }} />}
					<Badge px="1.5" py="0.5" mt="0.5" fontSize="10px" color="var(--wc-text-secondary)" bg="var(--wc-bg-active)">
						{guardrailName}
					</Badge>
					<Text fontSize="sm" color="var(--wc-text-primary)" textOverflow="ellipsis">{item.issue}</Text>
				</HStack>
				<Box
					as="button"
					onClick={() => addAnnotation(item.quote, item.issue)}
					title="Add to annotations"
					flexShrink={0}
					ml="2"
					p="1"
					borderRadius="4px"
					border="none"
					bg="transparent"
					cursor="pointer"
					color="var(--wc-text-muted)"
					_hover={{ bg: 'var(--wc-bg-subtle)', color: 'var(--wc-text-primary)' }}
				>
					<TbMessage2Plus size={18} />
				</Box>
			</Flex>
			<Text fontSize="12px" color="var(--wc-text-muted)" fontFamily="mono" fontStyle="italic" textOverflow="ellipsis" overflow="hidden" pl="6">
				{item.quote}
			</Text>
		</Box>
	);
});

const registerGuardrailChip = (api: IAppletAPIFE, name: string) => {
	api.registerComposerChip({
		componentId: `guardrail-${name}`,
		icon: FaShieldAlt,
		selectLabel: () => name,
		selectIsActive: (s) => {
			const ts = s.getCurrentThreadState(s);
			const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
			return guardrails?.[name]?.isActive ?? false;
		},
		onSetIsActive: (isActive) => {
			const state = api.useStore.getState();
			const threadId = state.currentThreadId;
			const ts = state.getCurrentThreadState(state);
			const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
			if (!guardrails[name]) return;
			state.setThreadState(threadId, { guardrails: { ...guardrails, [name]: { ...guardrails[name], isActive } } });
		},
		onClose: () => {
			const state = api.useStore.getState();
			const threadId = state.currentThreadId;
			const ts = state.getCurrentThreadState(state);
			const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
			if (!guardrails[name]) return;
			state.setThreadState(threadId, { guardrails: { ...guardrails, [name]: { ...guardrails[name], isActive: false } } });
		},
	});
};

const fn: IAppletFn<IAppletAPIFE> = async (api) => {
	console.log('[FEApplet] Started!');

	api.onReady(() => {
		console.log("[FEApplet] OnReady!");

		api.registerSlashCommand({
			name: 'compact',
			description: 'Compact the conversation thread. Add a message in chat for custom instructions.',
			params: {},
			execute: async (api, params) => { console.log('[FEApplet] /compact executed'); },
		});

		api.registerSlashCommand({
			name: 'guardrail',
			description: 'Create a custom guardrail',
			params: {
				name: { type: 'string', description: 'Guardrail name', index: 0 },
				tools: { type: 'string', description: 'Comma-separated tool names (empty = all)', index: 1 },
				server: { type: 'server', description: 'Server ID', index: 2 },
			},
			execute: async (_api, params, extraParams) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const ts = state.getCurrentThreadState(state);
				const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
				state.setThreadState(threadId, { guardrails: { ...guardrails, [params.name!]: {
					name: params.name,
					serverId: params.server,
					isActive: true,
					prompt: extraParams?.prompt,
					triggerOnTools: params.tools || undefined,
				} } });
			},
		});

		api.registerSlashCommand({
			name: 'toggle_guardrail',
			description: 'Activate or deactivate a guardrail',
			params: {
				name: { type: 'dropdown', description: 'Guardrail name', index: 0, props: {
					items: useGuardrailItems,
				}},
				action: { type: 'dropdown', description: 'on/off', index: 1, props: {
					items: [{ label: 'on', value: 'on' }, { label: 'off', value: 'off' }],
				}},
			},
			execute: async (_api, params) => {
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const ts = state.getCurrentThreadState(state);
				const guardrails = (ts?.guardrails || EMPTY_GUARDRAILS) as Record<string, IGuardrail>;
				if (!guardrails[params.name!]) return;
				state.setThreadState(threadId, { guardrails: { ...guardrails, [params.name!]: { ...guardrails[params.name!], isActive: params.action === 'on' } } });
			},
		});

		api.registerSlashCommand({
			name: 'todo',
			description: 'Add a new todo item',
			params: {},
			execute: async (_api, _params, extraParams) => {
				const text = extraParams?.prompt;
				if (!text) return;
				const state = api.useStore.getState();
				const threadId = state.currentThreadId;
				const ts = state.getCurrentThreadState(state);
				const todos = (ts?.todos || EMPTY_TODOS) as ITodoItem[];
				state.setThreadState(threadId, { todos: [...todos, { text, status: 'pending' }] });
			},
		});
		
		api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, TodoPanel, { label: 'To-Do', icon: LuListTodo });
		api.registerUiSpaceComponent(EUISpaceLoc.RIGHT_PANEL, GuardrailsPanel, { label: 'Guardrails', icon: FaShieldAlt });
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, CompactIndicator, { label: 'Compact Indicator' });
		api.registerUiSpaceComponent(EUISpaceLoc.MESSAGE, GuardrailResults, { label: 'GuardrailResults' });

		const unsubscribe = useStore.subscribe(
			(s) => s.getCurrentThreadState(s)?.guardrails,
			(guardrails, prevGuardrails) => {
				const currNames = guardrails ? Object.keys(guardrails) : [];
				const prevNames = prevGuardrails ? Object.keys(prevGuardrails) : [];
				for (const name of currNames.filter(n => !prevNames.includes(n))) {
					registerGuardrailChip(api, name);
				}
				for (const name of prevNames.filter(n => !currNames.includes(n))) {
					useStore.getState().unregisterUiSpaceComponent('FEApplet', `guardrail-${name}`);
				}
			},
			{ fireImmediately: true }
		);

		api.onTerminate(() => { unsubscribe(); });

		const blockingSlashCommands = ['guardrail', 'toggle_guardrail', 'todo'];

		api.eventNode.hook('..', 'bridge.preCompletion', async (eventApi) => {
			const payload = eventApi.payload as { slashCommands: Array<{ name: string }>; body: { userMessage: { content: string } } };
			const hasCompact = payload.slashCommands.some(cmd => cmd.name === 'compact');
			if (hasCompact && !payload.body.userMessage.content.trim()) {
				payload.body.userMessage.content = 'Continue';
			}
			return eventApi.result;
		});

		api.eventNode.hook('..', 'bridge.preCompletion', async (eventApi) => {
			const payload = eventApi.payload as { slashCommands: Array<{ name: string }>; body: { userMessage: { content: string } } };
			const hasBlocking = payload.slashCommands.some(cmd => blockingSlashCommands.includes(cmd.name));
			if (!hasBlocking) {
				const state = useStore.getState();
				const annotations = state.annotations;
				if (annotations.length > 0) {
					const lines = annotations.map((a, i) => `${i + 1}. "${a.selectedText}"\n   ${a.comment}`);
					const fullText = (lines.join('\n\n') + (payload.body.userMessage.content.trim() ? '\n\n' + payload.body.userMessage.content : '')).trim();
					payload.body.userMessage.content = fullText;
					state.clearAnnotations();
				}
			}
			return eventApi.result;
		});

		api.eventNode.hook('..', 'bridge.preCompletion', async (eventApi) => {
			const payload = eventApi.payload as { slashCommands: Array<{ name: string }> };
			for (const cmd of payload.slashCommands) {
				if (blockingSlashCommands.includes(cmd.name)) {
					console.log("Skip cmd hook - aborting send!");
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
