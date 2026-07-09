import React, { useMemo } from 'react';
import { Box, Text, HStack, VStack } from '@chakra-ui/react';
import { Square, CheckSquare, SquareCheck } from 'lucide-react';
import type { IToolCallRenderer, TCanRenderResult } from '@/store/types';

interface ITodoItem {
  text: string;
  status: 'pending' | 'done';
}

/* -- shared normalization helpers -- */

export function normalizeStatus(val: unknown): 'pending' | 'done' {
  if (val === true || val === 'done' || val === 'completed' || val === 'finished') return 'done';
  return 'pending';
}

export function extractText(obj: Record<string, unknown>): string | null {
  for (const key of ['text', 'title', 'content', 'name', 'label', 'todo']) {
    if (typeof obj[key] === 'string' && obj[key].length > 0) return obj[key];
  }
  return null;
}

export function extractStatus(obj: Record<string, unknown>): 'pending' | 'done' | null {
  for (const key of ['status', 'state', 'done', 'completed']) {
    if (key === 'done' || key === 'completed') {
      if (typeof obj[key] === 'boolean') return normalizeStatus(obj[key]);
    } else {
      if (obj[key] !== undefined && obj[key] !== null) return normalizeStatus(obj[key]);
    }
  }
  return null;
}

export function normalizeItem(obj: Record<string, unknown>): ITodoItem | null {
  const text = extractText(obj);
  if (!text) return null;
  const status = extractStatus(obj);
  return { text, status: status ?? 'pending' };
}

function extractIndex(args: Record<string, unknown>): number | undefined {
  for (const key of ['index', 'idx', 'pos', 'position']) {
    if (typeof args[key] === 'number') return args[key] as number;
  }
  return undefined;
}

function extractTodoArray(data: unknown): ITodoItem[] | null {
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (Array.isArray(data)) {
    // MCP content parts: [{ type: 'text', text: '...' }, ...]
    for (const elem of data) {
      if (elem && typeof elem === 'object' && typeof (elem as any).text === 'string') {
        const found = extractTodoArray((elem as any).text);
        if (found) return found;
      }
    }
    // Direct todo items
    const items = data.map(normalizeItem).filter((i): i is ITodoItem => i !== null);
    return items.length > 0 ? items : null;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    for (const key of ['todos', 'items', 'tasks', 'entries', 'list']) {
      if (Array.isArray(obj[key])) {
        const items = (obj[key] as unknown[]).map(normalizeItem).filter((i): i is ITodoItem => i !== null);
        if (items.length > 0) return items;
      }
    }
  }
  return null;
}

/* -- TodoListRenderer -- */

export const TodoListRenderer = React.memo((props: {
  items?: ITodoItem[];
  result?: unknown;
}) => {
  const items = useMemo(() => {
    if (props.items) return props.items;
    return props.result ? extractTodoArray(props.result) ?? [] : [];
  }, [props.items, props.result]);

  const doneCount = useMemo(() => items.filter(i => i.status === 'done').length, [items]);

  if (items.length === 0) {
    return (
      <Box px="3" py="2">
        <HStack gap="2" align="center">
          <SquareCheck size={13} color="var(--wc-text-secondary)" />
          <Text fontSize="12px" color="var(--wc-text-muted)">No todos</Text>
        </HStack>
      </Box>
    );
  }

  return (
    <Box px="3" py="2">
      <HStack gap="2" align="center" mb="2">
        <SquareCheck size={13} color="var(--wc-text-secondary)" />
        <Text fontSize="12px" color="var(--wc-text-muted)">
          {doneCount}/{items.length} done
        </Text>
      </HStack>
      <VStack gap="1" align="stretch">
        {items.map((item, i) => {
          const isDone = item.status === 'done';
          return (
            <HStack key={i} gap="2" align="center">
              {isDone
                ? <CheckSquare size={12} color="var(--wc-accent-green-icon)" />
                : <Square size={12} color="var(--wc-text-faint)" />
              }
              <Text fontSize="10px" color="var(--wc-text-faint)" minW="14px">{i + 1}.</Text>
              <Text
                fontSize="12px"
                fontFamily="mono"
                color={isDone ? 'var(--wc-text-muted)' : 'var(--wc-text-primary)'}
                textDecoration={isDone ? 'line-through' : 'none'}
                wordBreak="break-word"
              >
                {item.text}
              </Text>
            </HStack>
          );
        })}
      </VStack>
    </Box>
  );
});

export const TodoListRendererMeta: IToolCallRenderer = {
  component: TodoListRenderer,
  keywords: ['todo'],
  canRender: (args: Record<string, unknown>): TCanRenderResult => {
    // If args contain a todo array, normalize and return it
    const items = extractTodoArray(args);
    if (items) return { items };

    // Reject if args indicate an item operation
    const itemKey = args.todo ?? args.task ?? args.item ?? args.entry;
    if (itemKey && typeof itemKey === 'object') return false;
    if (args.index !== undefined || args.idx !== undefined || args.pos !== undefined) return false;

    // List operation (read/clear)
    return {};
  },
};

/* -- TodoItemRenderer -- */

export const TodoItemRenderer = React.memo((props: {
  text?: string;
  status?: 'pending' | 'done';
  index?: number;
  result?: unknown;
}) => {
  const itemFromIndex = useMemo(() => {
    if (props.index === undefined || !props.result) return null;
    const items = extractTodoArray(props.result);
    return items?.[props.index!] ?? null;
  }, [props.index, props.result]);

  const item = props.text ? { text: props.text, status: props.status ?? 'pending' } : itemFromIndex;

  if (item) {
    const isDone = item.status === 'done';
    return (
      <Box px="3" py="2">
       <HStack gap="2" align="center">
            {isDone
              ? <CheckSquare size={12} color="var(--wc-accent-green-icon)" />
              : <Square size={12} color="var(--wc-text-faint)" />
            }
            {props.index !== undefined && <Text fontSize="10px" color="var(--wc-text-faint)" minW="14px">{props.index + 1}.</Text>}
            <Text
              fontSize="12px"
              fontFamily="mono"
              color={isDone ? 'var(--wc-text-muted)' : 'var(--wc-text-primary)'}
              textDecoration={isDone ? 'line-through' : 'none'}
              wordBreak="break-word"
            >
              {item.text}
            </Text>
          </HStack>
      </Box>
    );
  }

  if (props.index !== undefined) {
    return (
      <Box px="3" py="2">
        <Text fontSize="12px" color="var(--wc-text-muted)" fontStyle="italic">
          Removed item #{props.index}
        </Text>
      </Box>
    );
  }

  return (
    <Box px="3" py="2">
      <Text fontSize="12px" color="var(--wc-text-muted)">Todo item</Text>
    </Box>
  );
});

export const TodoItemRendererMeta: IToolCallRenderer = {
  component: TodoItemRenderer,
  keywords: ['todo'],
  canRender: (args: Record<string, unknown>): TCanRenderResult => {
    // Single todo/task/item object (add)
    const itemKey = args.todo ?? args.task ?? args.item ?? args.entry;
    if (itemKey && typeof itemKey === 'object') {
      const normalized = normalizeItem(itemKey as Record<string, unknown>);
      if (normalized) return { text: normalized.text, status: normalized.status };
    }

    // Index-based operation (update, remove)
    const idx = extractIndex(args);
    if (idx !== undefined) {
      const status = args.status ?? args.state;
      return {
        index: idx,
        status: typeof status === 'string' ? normalizeStatus(status) : undefined,
      };
    }

    return false;
  },
};
