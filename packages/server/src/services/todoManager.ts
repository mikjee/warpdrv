import type { SqlitePersistence } from '@warpcore/bridge/server';
import type { ITodoItem } from '@warpcore/shared';

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

	async read(threadId: string): Promise<ITodoItem[]> {
		return this.getTodos(threadId);
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
}
