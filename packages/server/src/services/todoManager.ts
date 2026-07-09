import { nanoid } from 'nanoid';
import type { SqlitePersistence } from '@warpcore/bridge/server';
import type { ITodoItem } from '@warpcore/shared';

export interface ITodoResult {
	todos: ITodoItem[];
	etag: string | null;
}

export class TodoManager {
	private persistence: SqlitePersistence;

	constructor(persistence: SqlitePersistence) {
		this.persistence = persistence;
	}

	private async getTodos(threadId: string): Promise<ITodoItem[]> {
		const state = await this.persistence.getThreadState(threadId);
		return (state?.todos as ITodoItem[]) || [];
	}

	private async setTodos(threadId: string, todos: ITodoItem[]): Promise<void> {
		await this.persistence.updateThreadState(threadId, { todos });
	}

	async read(threadId: string): Promise<ITodoResult> {
		const state = await this.persistence.getThreadState(threadId);
		return {
			todos: (state?.todos as ITodoItem[]) || [],
			etag: (state?.todoEtag as string) || null,
		};
	}

	async add(threadId: string, todo: ITodoItem, index?: number): Promise<ITodoItem[]> {
		const todos = await this.getTodos(threadId);
		const pos = typeof index === 'number' ? index : todos.length;
		todos.splice(pos, 0, todo);
		await this.setTodos(threadId, todos);
		return todos;
	}

	async remove(threadId: string, index: number): Promise<ITodoItem[]> {
		const todos = await this.getTodos(threadId);
		if (index < 0 || index >= todos.length) {
			throw new Error(`Index ${index} out of range`);
		}
		todos.splice(index, 1);
		await this.setTodos(threadId, todos);
		return todos;
	}

	async update(threadId: string, index: number, status: ITodoItem['status']): Promise<ITodoItem[]> {
		const todos = await this.getTodos(threadId);
		if (index < 0 || index >= todos.length) {
			throw new Error(`Index ${index} out of range`);
		}
		todos[index].status = status;
		await this.setTodos(threadId, todos);
		return todos;
	}

	async clear(threadId: string): Promise<ITodoItem[]> {
		await this.setTodos(threadId, []);
		return [];
	}

	async write(threadId: string, todos: ITodoItem[], etag?: string): Promise<any> {
		const state = await this.persistence.getThreadState(threadId);
		const currentTodos = (state?.todos as ITodoItem[]) || [];
		const currentEtag = (state?.todoEtag as string) || null;

		if (!etag) {
			if (currentTodos.length !== 0) {
				throw new Error('Cannot write: todo list is not empty. Provide the current etag to overwrite.');
			}
		} else if (etag !== currentEtag) {
			console.error("To-do etag mismatch.", etag, currentEtag);
			throw new Error('Cannot write: etag mismatch. Provide the latest etag - either from system-reminder or fresh read.');
		}

		const newEtag = nanoid(6);
		await this.persistence.updateThreadState(threadId, { todos, todoEtag: newEtag });
		return { status: "success", newEtag };
	}
}
