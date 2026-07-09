import type { ITodoItem } from '@warpcore/shared';
import type { IWarpmcpDeps, ITodoResult } from '../types';

function guard(deps: IWarpmcpDeps, fn: keyof IWarpmcpDeps) {
	if (!deps[fn]) throw new Error(`${String(fn)} not available`);
}

// todo_read
export const todoReadDefinition = {
	name: 'todo_read',
	description: 'Read the current todo list for this thread.',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
};
export async function todoReadHandler(deps: IWarpmcpDeps, args: { threadId: string }): Promise<ITodoResult> {
	guard(deps, 'todoRead');
	return await deps.todoRead!(args.threadId);
}

// todo_add
export const todoAddDefinition = {
	name: 'todo_add',
	description: 'Add a todo item to the list. Optionally specify an index to insert at (defaults to end).',
	inputSchema: {
		type: 'object',
		properties: {
			todo: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['pending', 'done'] } }, required: ['text'] },
			index: { type: 'number', description: 'Position to insert at (defaults to end of list).' },
		},
		required: ['todo'],
	},
};
export async function todoAddHandler(deps: IWarpmcpDeps, args: { threadId: string; todo: ITodoItem; index?: number }): Promise<{ todos: ITodoItem[] }> {
	guard(deps, 'todoAdd');
	const todos = await deps.todoAdd!(args.threadId, { text: args.todo.text, status: args.todo.status ?? 'pending' }, args.index);
	return { todos };
}

// todo_remove
export const todoRemoveDefinition = {
	name: 'todo_remove',
	description: 'Remove a todo item by its array index.',
	inputSchema: {
		type: 'object',
		properties: {
			index: { type: 'number', description: 'Array index of the todo to remove.' },
		},
		required: ['index'],
	},
};
export async function todoRemoveHandler(deps: IWarpmcpDeps, args: { threadId: string; index: number }): Promise<{ todos: ITodoItem[] }> {
	guard(deps, 'todoRemove');
	const todos = await deps.todoRemove!(args.threadId, args.index);
	return { todos };
}

// todo_update
export const todoUpdateDefinition = {
	name: 'todo_update',
	description: 'Update the status of a todo item by its array index.',
	inputSchema: {
		type: 'object',
		properties: {
			index: { type: 'number', description: 'Array index of the todo to update.' },
			status: { type: 'string', enum: ['pending', 'done'], description: 'New status.' },
		},
		required: ['index', 'status'],
	},
};
export async function todoUpdateHandler(deps: IWarpmcpDeps, args: { threadId: string; index: number; status: ITodoItem['status'] }): Promise<{ todos: ITodoItem[] }> {
	guard(deps, 'todoUpdate');
	const todos = await deps.todoUpdate!(args.threadId, args.index, args.status);
	return { todos };
}

// todo_clear
export const todoClearDefinition = {
	name: 'todo_clear',
	description: 'Clear all todo items from the list.',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
};
export async function todoClearHandler(deps: IWarpmcpDeps, args: { threadId: string }): Promise<{ todos: ITodoItem[] }> {
	guard(deps, 'todoClear');
	const todos = await deps.todoClear!(args.threadId);
	return { todos };
}

// todo_write
export const todoWriteDefinition = {
	name: 'todo_write',
	description: 'Replace the entire todo list with a new array of items.',
	inputSchema: {
		type: 'object',
		properties: {
			todos: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, status: { type: 'string', enum: ['pending', 'done'] } }, required: ['text'] } },
			etag: { type: 'string', description: 'Current etag. Leave blank if list is currently empty, MUST provide the latest etag if todos is not currently empty - to prevent accidental overwrite.' },
		},
		required: ['todos'],
	},
};
export async function todoWriteHandler(deps: IWarpmcpDeps, args: { threadId: string; todos: ITodoItem[]; etag?: string }): Promise<ITodoResult> {
	guard(deps, 'todoWrite');
	return await deps.todoWrite!(args.threadId, args.todos, args.etag);
}
