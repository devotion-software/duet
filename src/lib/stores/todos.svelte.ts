import { hydrateTodo, type Todo } from '#lib/types';
import { ancestorsOf, buildChildren, withDescendants } from '#lib/todoTree';
import { toasts } from '#lib/components/ui/toast.svelte';
import type { GroupAs } from '#lib/parseImport';
import type { RealtimeEvent } from '#lib/server/realtime';

export interface NewTodoInput {
	title: string;
	/** Nest under this task; null moves a task to the top level. */
	parentId?: string | null;
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
	/** With `completed`, close as not doing rather than done. */
	notDoing?: boolean;
	inProgress?: boolean;
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

	/** Children of each task (roots under `null`), siblings sorted. */
	children = $derived(buildChildren(this.items));

	/** Every open / completed task, at any depth. */
	get open() {
		return this.items.filter((t) => !t.completed).sort(sortOpen);
	}
	get done() {
		return this.items.filter((t) => t.completed).sort(sortDone);
	}
	/** Top-level tasks; subtasks render beneath these. */
	get openRoots() {
		return (this.children.get(null) ?? []).filter((t) => !t.completed);
	}
	get doneRoots() {
		return (this.children.get(null) ?? []).filter((t) => t.completed).sort(sortDone);
	}
	childrenOf(id: string): Todo[] {
		return this.children.get(id) ?? [];
	}
	ancestorsOf(id: string): Todo[] {
		return ancestorsOf(this.items, id);
	}
	/** `ids` plus all their subtasks, at any depth. */
	withDescendants(ids: Iterable<string>): Set<string> {
		return withDescendants(this.items, ids);
	}

	/** Mirror the server's cascade: done → whole subtree, reopened → ancestors. */
	#cascadeCompleted(id: string, completed: boolean, notDoing = false): Todo[] {
		const affected = completed
			? [...this.withDescendants([id])].map((i) => this.items.find((t) => t.id === i)!)
			: [this.items.find((t) => t.id === id)!, ...this.ancestorsOf(id)];
		const changed = affected.filter((t) => t && t.completed !== completed);
		for (const t of changed) {
			t.completed = completed;
			t.completedAt = completed ? new Date() : null;
			t.notDoing = completed && notDoing;
		}
		return changed;
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
		const parentId = input.parentId ?? null;
		// New top-level tasks go first; new subtasks go last among their siblings.
		const sortOrder = parentId
			? Math.min(1, ...this.childrenOf(parentId).map((t) => t.sortOrder)) - 1
			: this.items.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1;
		const tempId = `temp-${Math.random().toString(36).slice(2)}`;
		const now = new Date();
		const optimistic: Todo = {
			id: tempId,
			projectId: this.projectId,
			parentId,
			title: input.title,
			description: input.description ?? null,
			completed: false,
			completedAt: null,
			notDoing: false,
			startedAt: null,
			deadline: input.deadline ? new Date(input.deadline) : null,
			urgency: (input.urgency as Todo['urgency']) ?? null,
			size: (input.size as Todo['size']) ?? null,
			sortOrder,
			categoryId: input.categoryId ?? null,
			category: null,
			assigneeId: input.assigneeId ?? null,
			assignee: null,
			createdAt: now,
			updatedAt: now,
			tags: [],
			attachments: [],
			links: []
		};
		this.items.push(optimistic);
		// An open subtask means its ancestors aren't done any more.
		const reopened = parentId ? this.#cascadeCompleted(parentId, false) : [];
		try {
			const res = await this.#fetch(`${this.#base()}/todos`, {
				method: 'POST',
				body: JSON.stringify(input)
			});
			const { todo, todos } = await res.json();
			const hydrated = hydrateTodo(todo);
			const i = this.items.findIndex((t) => t.id === tempId);
			if (i >= 0) this.items[i] = hydrated;
			for (const t of (todos ?? []) as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
			return hydrated;
		} catch (e) {
			this.items = this.items.filter((t) => t.id !== tempId);
			for (const t of reopened) {
				t.completed = true;
				t.completedAt = new Date();
			}
			toasts.error((e as Error).message);
			return null;
		}
	}

	/** Close an open task (as done, or as not doing), or reopen a closed one. */
	async toggle(id: string, notDoing = false) {
		const todo = this.items.find((t) => t.id === id);
		if (!todo) return;
		const nextCompleted = !todo.completed;
		// Reopening forgets which closed tasks were not doing; keep that in case it fails.
		const wasNotDoing = new Set(this.items.filter((t) => t.notDoing).map((t) => t.id));
		const snapshot = this.#cascadeCompleted(id, nextCompleted, notDoing).map((t) => ({ ...t }));
		const verb = notDoing ? 'Not doing' : 'Completed';
		const toastId = nextCompleted
			? toasts.success(`${verb} “${todo.title}”`, 6000, {
					label: 'Undo',
					run: () => this.#undoComplete(snapshot)
				})
			: null;
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${id}/toggle`, {
				method: 'POST',
				body: JSON.stringify({ completed: nextCompleted, notDoing })
			});
			const { todos } = await res.json();
			for (const t of (todos ?? []) as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
		} catch (e) {
			if (toastId !== null) toasts.dismiss(toastId);
			for (const t of snapshot) {
				const cur = this.items.find((x) => x.id === t.id);
				if (cur) {
					cur.completed = !nextCompleted;
					cur.completedAt = !nextCompleted ? new Date() : null;
					cur.notDoing = wasNotDoing.has(t.id);
				}
			}
			toasts.error((e as Error).message);
		}
	}

	/** Reopen the tasks a completion closed, restarting any that were in progress. */
	async #undoComplete(closed: Pick<Todo, 'id' | 'startedAt'>[]) {
		for (const prev of closed) {
			const cur = this.items.find((t) => t.id === prev.id);
			if (!cur) continue;
			cur.completed = false;
			cur.completedAt = null;
			cur.notDoing = false;
			cur.startedAt = prev.startedAt;
		}
		const started = closed.filter((t) => t.startedAt).map((t) => t.id);
		const idle = closed.filter((t) => !t.startedAt).map((t) => t.id);
		const ok = await Promise.all([
			idle.length ? this.bulkUpdate(idle, { completed: false }) : true,
			started.length ? this.bulkUpdate(started, { inProgress: true }) : true
		]);
		if (ok.includes(false)) this.onRefetch?.();
	}

	/** Start or stop work on a task; starting a done task reopens it. */
	async setInProgress(id: string, inProgress: boolean) {
		const todo = this.items.find((t) => t.id === id);
		if (!todo) return;
		const prev = todo.startedAt;
		const reopened = inProgress ? this.#cascadeCompleted(id, false) : [];
		todo.startedAt = inProgress ? (prev ?? new Date()) : null;
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ inProgress })
			});
			const { todo: updated, todos } = await res.json();
			if (updated) this.#replace(hydrateTodo(updated));
			for (const t of (todos ?? []) as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
		} catch (e) {
			todo.startedAt = prev;
			for (const t of reopened) {
				t.completed = true;
				t.completedAt = new Date();
			}
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
			if (patch.parentId !== undefined) prev.parentId = patch.parentId ?? null;
		}
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${id}`, {
				method: 'PATCH',
				body: JSON.stringify(patch)
			});
			const { todo, todos } = await res.json();
			if (todo) this.#replace(hydrateTodo(todo));
			for (const t of (todos ?? []) as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
		} catch (e) {
			if (snapshot) this.#replace(snapshot as Todo);
			toasts.error((e as Error).message);
		}
	}

	/** Apply one change to many todos. Not optimistic: the server owns the tag merge. */
	async bulkUpdate(ids: string[], patch: BulkPatchInput): Promise<boolean> {
		// Completing closes whole subtrees; remember what was open so it can be undone.
		const closing = patch.completed
			? [...this.withDescendants(ids)]
					.map((id) => this.items.find((t) => t.id === id))
					.filter((t): t is Todo => !!t && !t.completed)
					.map((t) => ({ id: t.id, startedAt: t.startedAt }))
			: [];
		try {
			const res = await this.#fetch(`${this.#base()}/todos/bulk`, {
				method: 'PATCH',
				body: JSON.stringify({ ids, patch })
			});
			const { todos } = await res.json();
			for (const t of todos as Record<string, unknown>[]) this.#replace(hydrateTodo(t));
			if (closing.length) {
				const n = ids.length;
				const verb = patch.notDoing ? 'Not doing' : 'Completed';
				toasts.success(`${verb} ${n} task${n === 1 ? '' : 's'}`, 6000, {
					label: 'Undo',
					run: () => this.#undoComplete(closing)
				});
			}
			return true;
		} catch (e) {
			toasts.error((e as Error).message);
			return false;
		}
	}

	async bulkRemove(ids: string[]): Promise<boolean> {
		const gone = this.withDescendants(ids);
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

	/** Delete a task along with all its subtasks. */
	async remove(id: string) {
		if (!this.items.some((t) => t.id === id)) return;
		const gone = this.withDescendants([id]);
		const prev = this.items;
		this.items = this.items.filter((t) => !gone.has(t.id));
		try {
			await this.#fetch(`${this.#base()}/todos/${id}`, { method: 'DELETE' });
		} catch (e) {
			this.items = prev;
			toasts.error((e as Error).message);
		}
	}

	/** Merge in tasks changed elsewhere (e.g. restored from project settings). */
	merge(todos: Record<string, unknown>[]) {
		for (const t of todos) this.#replace(hydrateTodo(t));
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
			// Reassign so anything watching the task (e.g. its history) sees the confirmed change.
			todo.attachments = [...todo.attachments];
		} catch (e) {
			todo.attachments = prev;
			toasts.error((e as Error).message);
		}
	}

	async addUrlLink(todoId: string, url: string, title: string | null): Promise<void> {
		const todo = this.items.find((t) => t.id === todoId);
		if (!todo) return;
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${todoId}/links`, {
				method: 'POST',
				body: JSON.stringify({ kind: 'url', url, title })
			});
			const { link } = await res.json();
			todo.links = [...todo.links, link];
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	async addTaskLink(todoId: string, linkedProjectId: string, linkedTodoId: string): Promise<void> {
		const todo = this.items.find((t) => t.id === todoId);
		if (!todo) return;
		try {
			const res = await this.#fetch(`${this.#base()}/todos/${todoId}/links`, {
				method: 'POST',
				body: JSON.stringify({ kind: 'task', linkedProjectId, linkedTodoId })
			});
			const { link } = await res.json();
			todo.links = [...todo.links, link];
		} catch (e) {
			toasts.error((e as Error).message);
		}
	}

	async removeLink(todoId: string, linkId: string): Promise<void> {
		const todo = this.items.find((t) => t.id === todoId);
		if (!todo) return;
		const prev = todo.links;
		todo.links = todo.links.filter((l) => l.id !== linkId);
		try {
			await this.#fetch(`${this.#base()}/links/${linkId}`, { method: 'DELETE' });
		} catch (e) {
			todo.links = prev;
			toasts.error((e as Error).message);
		}
	}

	async importText(text: string, groupAs: GroupAs = 'category'): Promise<number> {
		const res = await this.#fetch(`${this.#base()}/todos/import`, {
			method: 'POST',
			body: JSON.stringify({ text, groupAs })
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

	/** Move an open task next to an open sibling, then save the siblings' new order. */
	move(id: string, targetId: string, pos: 'before' | 'after') {
		const siblings = [...this.children.values()].find((list) => list.some((t) => t.id === id)) ?? [];
		const ids = siblings.filter((t) => !t.completed && t.id !== id).map((t) => t.id);
		const at = ids.indexOf(targetId);
		if (at < 0) return;
		ids.splice(pos === 'before' ? at : at + 1, 0, id);
		return this.reorderOpen(ids);
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
				const ids = this.withDescendants((event.payload as { ids: string[] })?.ids ?? []);
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
