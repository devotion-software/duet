import { hydrateTodo, type Todo } from '#lib/types';
import { toasts } from '#lib/components/ui/toast.svelte';
import type { RealtimeEvent } from '#lib/server/realtime';

export interface NewTodoInput {
	title: string;
	description?: string | null;
	categoryId?: string | null;
	assigneeId?: string | null;
	deadline?: string | null;
	urgency?: string | null;
	size?: string | null;
	tagIds?: string[];
}

export interface BulkPatchInput {
	categoryId?: string | null;
	assigneeId?: string | null;
	deadline?: string | null;
	urgency?: string | null;
	size?: string | null;
	completed?: boolean;
	addTagIds?: string[];
	removeTagIds?: string[];
}

function sortOpen(a: Todo, b: Todo) {
	return b.sortOrder - a.sortOrder || b.createdAt.getTime() - a.createdAt.getTime();
}
function sortDone(a: Todo, b: Todo) {
	return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
}

export class TodosController {
	projectId: string;
	clientId = Math.random().toString(36).slice(2);
	items = $state<Todo[]>([]);
	/** Called when an external realtime event needs a full reload. */
	onRefetch?: () => void;

	constructor(projectId: string, initial: Todo[]) {
		this.projectId = projectId;
		this.items = initial.map((t) => hydrateTodo(t as unknown as Record<string, unknown>));
	}

	reset(projectId: string, initial: Todo[]) {
		this.projectId = projectId;
		this.items = initial.map((t) => hydrateTodo(t as unknown as Record<string, unknown>));
	}

	get open() {
		return this.items.filter((t) => !t.completed).sort(sortOpen);
	}
	get done() {
		return this.items.filter((t) => t.completed).sort(sortDone);
	}

	#base() {
		return `/api/projects/${this.projectId}`;
	}
	async #fetch(url: string, init?: RequestInit) {
		const res = await fetch(url, {
			...init,
			headers: {
				'content-type': 'application/json',
				'x-client-id': this.clientId,
				...(init?.headers ?? {})
			}
		});
		if (!res.ok) {
			let message = 'Something went wrong';
			try {
				message = (await res.json()).message ?? message;
			} catch {
				/* ignore */
			}
			throw new Error(message);
		}
		return res;
	}

	#replace(todo: Todo) {
		const i = this.items.findIndex((t) => t.id === todo.id);
		if (i >= 0) this.items[i] = todo;
		else this.items.push(todo);
	}

	async add(input: NewTodoInput): Promise<Todo | null> {
		const maxOrder = this.items.reduce((m, t) => Math.max(m, t.sortOrder), 0);
		const tempId = `temp-${Math.random().toString(36).slice(2)}`;
		const now = new Date();
		const optimistic: Todo = {
			id: tempId,
			projectId: this.projectId,
			title: input.title,
			description: input.description ?? null,
			completed: false,
			completedAt: null,
			deadline: input.deadline ? new Date(input.deadline) : null,
			urgency: (input.urgency as Todo['urgency']) ?? null,
			size: (input.size as Todo['size']) ?? null,
			sortOrder: maxOrder + 1,
			categoryId: input.categoryId ?? null,
			category: null,
			assigneeId: input.assigneeId ?? null,
			assignee: null,
			createdAt: now,
			updatedAt: now,
			tags: [],
			attachments: []
		};
		this.items.push(optimistic);
		try {
			const res = await this.#fetch(`${this.#base()}/todos`, {
				method: 'POST',
				body: JSON.stringify(input)
			});
			const { todo } = await res.json();
			const hydrated = hydrateTodo(todo);
			const i = this.items.findIndex((t) => t.id === tempId);
			if (i >= 0) this.items[i] = hydrated;
			return hydrated;
		} catch (e) {
			this.items = this.items.filter((t) => t.id !== tempId);
			toasts.error((e as Error).message);
			return null;
		}
	}

	async toggle(id: string) {
		const todo = this.items.find((t) => t.id === id);
		if (!todo) return;
		const nextCompleted = !todo.completed;
		todo.completed = nextCompleted;
		todo.completedAt = nextCompleted ? new Date() : null;
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${id}/toggle`, {
				method: 'POST',
				body: JSON.stringify({ completed: nextCompleted })
			});
			const { todo: updated } = await res.json();
			if (updated) this.#replace(hydrateTodo(updated));
		} catch (e) {
			todo.completed = !nextCompleted;
			todo.completedAt = !nextCompleted ? new Date() : null;
			toasts.error((e as Error).message);
		}
	}

	async update(id: string, patch: Partial<NewTodoInput>) {
		const prev = this.items.find((t) => t.id === id);
		const snapshot = prev ? { ...prev } : null;
		if (prev) {
			// Optimistic merge of simple fields.
			if (patch.title !== undefined) prev.title = patch.title;
			if (patch.description !== undefined) prev.description = patch.description ?? null;
			if (patch.deadline !== undefined) prev.deadline = patch.deadline ? new Date(patch.deadline) : null;
			if (patch.urgency !== undefined) prev.urgency = (patch.urgency as Todo['urgency']) ?? null;
			if (patch.size !== undefined) prev.size = (patch.size as Todo['size']) ?? null;
		}
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${id}`, {
				method: 'PATCH',
				body: JSON.stringify(patch)
			});
			const { todo } = await res.json();
			if (todo) this.#replace(hydrateTodo(todo));
		} catch (e) {
			if (snapshot) this.#replace(snapshot as Todo);
			toasts.error((e as Error).message);
		}
	}

	/** Apply one change to many todos. Not optimistic: the server owns the tag merge. */
	async bulkUpdate(ids: string[], patch: BulkPatchInput): Promise<boolean> {
		try {
			const res = await this.#fetch(`${this.#base()}/todos/bulk`, {
				method: 'PATCH',
				body: JSON.stringify({ ids, patch })
			});
			const { todos } = await res.json();
			for (const t of todos as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	async bulkRemove(ids: string[]): Promise<boolean> {
		const gone = new Set(ids);
		const prev = this.items;
		this.items = this.items.filter((t) => !gone.has(t.id));
		try {
			await this.#fetch(`${this.#base()}/todos/bulk`, {
				method: 'DELETE',
				body: JSON.stringify({ ids })
			});
			return true;
		} catch (e) {
			this.items = prev;
			toasts.error((e as Error).message);
			return false;
		}
	}

	async remove(id: string) {
		const idx = this.items.findIndex((t) => t.id === id);
		if (idx < 0) return;
		const [removed] = this.items.splice(idx, 1);
		try {
			await this.#fetch(`${this.#base()}/todos/${id}`, { method: 'DELETE' });
		} catch (e) {
			this.items.splice(idx, 0, removed);
			toasts.error((e as Error).message);
		}
	}

	async addAttachment(todoId: string, file: File): Promise<void> {
		const todo = this.items.find((t) => t.id === todoId);
		if (!todo) return;
		try {
			// FormData sets its own multipart content-type, so don't use #fetch.
			const res = await fetch(`${this.#base()}/todos/${todoId}/attachments`, {
				method: 'POST',
				headers: { 'x-client-id': this.clientId },
				body: (() => {
					const fd = new FormData();
					fd.append('file', file);
					return fd;
				})()
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Upload failed');
			const { attachment } = await res.json();
			todo.attachments = [...todo.attachments, attachment];
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	async removeAttachment(todoId: string, attachmentId: string): Promise<void> {
		const todo = this.items.find((t) => t.id === todoId);
		if (!todo) return;
		const prev = todo.attachments;
		todo.attachments = todo.attachments.filter((a) => a.id !== attachmentId);
		try {
			const res = await fetch(`${this.#base()}/attachments/${attachmentId}`, {
				method: 'DELETE',
				headers: { 'x-client-id': this.clientId }
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Delete failed');
		} catch (e) {
			todo.attachments = prev;
			toasts.error((e as Error).message);
		}
	}

	async importText(text: string): Promise<number> {
		const res = await this.#fetch(`${this.#base()}/todos/import`, {
			method: 'POST',
			body: JSON.stringify({ text })
		});
		const { todos, count } = await res.json();
		this.items = (todos as Record<string, unknown>[]).map(hydrateTodo);
		return count;
	}

	async reorderOpen(ids: string[]) {
		// Apply new sortOrder locally (highest = top).
		const n = ids.length;
		ids.forEach((id, i) => {
			const t = this.items.find((x) => x.id === id);
			if (t) t.sortOrder = n - i;
		});
		try {
			await this.#fetch(`${this.#base()}/todos/reorder`, {
				method: 'POST',
				body: JSON.stringify({ ids })
			});
		} catch (e) {
			toasts.error((e as Error).message);
			this.onRefetch?.();
		}
	}

	/** Apply an event received over SSE (ignores our own echoes). */
	applyEvent(event: RealtimeEvent) {
		if (event.origin && event.origin === this.clientId) return;
		switch (event.type) {
			case 'todo.created':
			case 'todo.updated':
				if (event.payload) this.#replace(hydrateTodo(event.payload as Record<string, unknown>));
				break;
			case 'todos.updated':
				for (const t of (event.payload as Record<string, unknown>[]) ?? [])
					this.#replace(hydrateTodo(t));
				break;
			case 'todos.deleted': {
				const ids = new Set((event.payload as { ids: string[] })?.ids ?? []);
				this.items = this.items.filter((t) => !ids.has(t.id));
				break;
			}
			case 'todo.deleted': {
				const id = (event.payload as { id: string })?.id;
				if (id) this.items = this.items.filter((t) => t.id !== id);
				break;
			}
			case 'todos.imported':
			case 'todos.reordered':
			case 'tag.changed':
			case 'category.changed':
			case 'member.changed':
			case 'project.updated':
				this.onRefetch?.();
				break;
		}
	}
}
