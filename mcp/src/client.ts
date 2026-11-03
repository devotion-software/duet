const BASE_URL = process.env.DUET_BASE_URL ?? 'https://duet.devotion.software';
const API_KEY = process.env.DUET_API_KEY;

if (!API_KEY) {
	throw new Error('DUET_API_KEY is not set. Create one in Duet under Settings → API keys.');
}

export class DuetApiError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const res = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			'x-api-key': API_KEY!,
			...(body !== undefined ? { 'content-type': 'application/json' } : {})
		},
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new DuetApiError(res.status, `${method} ${path} → ${res.status}: ${text || res.statusText}`);
	}
	if (res.status === 204) return undefined as T;
	return (await res.json()) as T;
}

export interface Project {
	id: string;
	slug: string;
	name: string;
	status: string;
	role: string;
	openCount: number;
	totalCount: number;
}

export interface Todo {
	id: string;
	projectId: string;
	parentId: string | null;
	title: string;
	description: string | null;
	completed: boolean;
	notDoing: boolean;
	startedAt: string | null;
	testingAt: string | null;
	deadline: string | null;
	urgency: string | null;
	size: string | null;
	assignee: { id: string; name: string } | null;
	category: { id: string; name: string } | null;
	tags: { id: string; name: string }[];
}

export interface Label {
	id: string;
	projectId: string;
	name: string;
	color: string;
	usageCount?: number;
}

export type TaskStatus = 'open' | 'in_progress' | 'to_test' | 'done' | 'not_doing';

export function statusOf(t: Pick<Todo, 'completed' | 'notDoing' | 'startedAt' | 'testingAt'>): TaskStatus {
	if (t.completed) return t.notDoing ? 'not_doing' : 'done';
	if (t.testingAt) return 'to_test';
	return t.startedAt ? 'in_progress' : 'open';
}

/** Matches by exact id first, then case-insensitive name. */
function findLabel(all: Label[], ref: string) {
	const name = ref.trim().toLowerCase();
	return all.find((l) => l.id === ref) ?? all.find((l) => l.name.toLowerCase() === name);
}

export const duet = {
	listProjects: () => request<{ projects: Project[] }>('GET', '/api/projects').then((r) => r.projects),

	listTasks: (projectId: string) =>
		request<{ todos: Todo[] }>('GET', `/api/projects/${projectId}/todos`).then((r) => r.todos),

	getTask: async (projectId: string, todoId: string) => {
		const todos = await duet.listTasks(projectId);
		const todo = todos.find((t) => t.id === todoId);
		if (!todo) throw new DuetApiError(404, `Task ${todoId} not found in project ${projectId}`);
		return todo;
	},

	createTask: (
		projectId: string,
		input: {
			title: string;
			description?: string;
			parentId?: string | null;
			urgency?: string;
			size?: string;
			deadline?: string | null;
			categoryId?: string | null;
			tagIds?: string[];
		}
	) =>
		request<{ todo: Todo }>('POST', `/api/projects/${projectId}/todos`, input).then((r) => r.todo),

	updateTask: (
		projectId: string,
		todoId: string,
		patch: Partial<{
			title: string;
			description: string;
			urgency: string;
			size: string;
			deadline: string | null;
			inProgress: boolean;
			toTest: boolean;
			categoryId: string | null;
			tagIds: string[];
		}>
	) => request<{ todo: Todo }>('PATCH', `/api/projects/${projectId}/todos/${todoId}`, patch).then((r) => r.todo),

	listTags: (projectId: string) =>
		request<{ tags: Label[] }>('GET', `/api/projects/${projectId}/tags`).then((r) => r.tags),

	createTag: (projectId: string, input: { name: string; color?: string }) =>
		request<{ tag: Label }>('POST', `/api/projects/${projectId}/tags`, input).then((r) => r.tag),

	updateTag: (projectId: string, tagId: string, patch: { name?: string; color?: string }) =>
		request<{ tag: Label }>('PATCH', `/api/projects/${projectId}/tags/${tagId}`, patch).then((r) => r.tag),

	deleteTag: (projectId: string, tagId: string) =>
		request<{ ok: true }>('DELETE', `/api/projects/${projectId}/tags/${tagId}`),

	listCategories: (projectId: string) =>
		request<{ categories: Label[] }>('GET', `/api/projects/${projectId}/categories`).then(
			(r) => r.categories
		),

	createCategory: (projectId: string, input: { name: string; color?: string }) =>
		request<{ category: Label }>('POST', `/api/projects/${projectId}/categories`, input).then(
			(r) => r.category
		),

	updateCategory: (projectId: string, categoryId: string, patch: { name?: string; color?: string }) =>
		request<{ category: Label }>(
			'PATCH',
			`/api/projects/${projectId}/categories/${categoryId}`,
			patch
		).then((r) => r.category),

	deleteCategory: (projectId: string, categoryId: string) =>
		request<{ ok: true }>('DELETE', `/api/projects/${projectId}/categories/${categoryId}`),

	/**
	 * Resolves tag ids-or-names to ids. Unknown names are created when `create` is set
	 * (without a colour, so an existing tag's colour is never overwritten); otherwise they throw.
	 */
	resolveTagIds: async (projectId: string, refs: string[], create = false) => {
		const all = await duet.listTags(projectId);
		const ids: string[] = [];
		for (const ref of refs) {
			const found = findLabel(all, ref);
			if (found) ids.push(found.id);
			else if (create) {
				const tag = await duet.createTag(projectId, { name: ref.trim() });
				all.push(tag);
				ids.push(tag.id);
			} else throw new DuetApiError(404, `Tag "${ref}" not found in project ${projectId}`);
		}
		return [...new Set(ids)];
	},

	/** Resolves a category id-or-name to its id, creating it by name when `create` is set. */
	resolveCategoryId: async (projectId: string, ref: string, create = false) => {
		const all = await duet.listCategories(projectId);
		const found = findLabel(all, ref);
		if (found) return found.id;
		if (create) return (await duet.createCategory(projectId, { name: ref.trim() })).id;
		throw new DuetApiError(404, `Category "${ref}" not found in project ${projectId}`);
	},

	toggleTask: (projectId: string, todoId: string, completed: boolean, notDoing: boolean) =>
		request<{ todo: Todo }>('POST', `/api/projects/${projectId}/todos/${todoId}/toggle`, {
			completed,
			notDoing
		}).then((r) => r.todo),

	/** Sets a task's status by calling whichever of PATCH/toggle actually changes it. */
	setTaskStatus: async (projectId: string, todoId: string, status: TaskStatus) => {
		const current = await duet.getTask(projectId, todoId);
		if (status === 'done' || status === 'not_doing') {
			return duet.toggleTask(projectId, todoId, true, status === 'not_doing');
		}
		if (current.completed) {
			await duet.toggleTask(projectId, todoId, false, false);
		}
		return duet.updateTask(projectId, todoId, {
			inProgress: status === 'in_progress',
			toTest: status === 'to_test'
		});
	}
};
