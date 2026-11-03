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

async function resolveLabels(
	all: Label[],
	refs: string[],
	kind: string,
	projectId: string,
	create?: (name: string) => Promise<Label>
) {
	const out = new Map<string, string>();
	for (const ref of refs) {
		if (out.has(ref)) continue;
		let found = findLabel(all, ref);
		if (!found && create) {
			found = await create(ref.trim());
			all.push(found);
		}
		if (!found) throw new DuetApiError(404, `${kind} "${ref}" not found in project ${projectId}`);
		out.set(ref, found.id);
	}
	return out;
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
	 * Maps each tag id-or-name to its id with a single listing. Unknown names are created when
	 * `create` is set (without a colour, so an existing tag's colour is never overwritten);
	 * otherwise they throw.
	 */
	resolveTagMap: async (projectId: string, refs: string[], create = false) =>
		resolveLabels(await duet.listTags(projectId), refs, 'Tag', projectId, create
			? (name) => duet.createTag(projectId, { name })
			: undefined),

	resolveTagIds: async (projectId: string, refs: string[], create = false) => [
		...new Set((await duet.resolveTagMap(projectId, refs, create)).values())
	],

	/** Maps each category id-or-name to its id, creating unknown names when `create` is set. */
	resolveCategoryMap: async (projectId: string, refs: string[], create = false) =>
		resolveLabels(await duet.listCategories(projectId), refs, 'Category', projectId, create
			? (name) => duet.createCategory(projectId, { name })
			: undefined),

	resolveCategoryId: async (projectId: string, ref: string, create = false) =>
		(await duet.resolveCategoryMap(projectId, [ref], create)).get(ref)!,

	/** Creates many tasks atomically (all or nothing). Returns them in input order. */
	bulkCreateTasks: (
		projectId: string,
		todos: {
			title: string;
			description?: string;
			parentId?: string;
			parentIndex?: number;
			urgency?: string;
			size?: string;
			deadline?: string;
			categoryId?: string;
			tagIds?: string[];
		}[]
	) =>
		request<{ todos: Todo[]; reopened: Todo[] }>('POST', `/api/projects/${projectId}/todos/bulk`, { todos }),

	/** Applies one patch to many tasks atomically. Returns every task touched (incl. reopened ancestors). */
	bulkUpdateTasks: (
		projectId: string,
		ids: string[],
		patch: Partial<{
			urgency: string | null;
			size: string | null;
			deadline: string | null;
			categoryId: string | null;
			addTagIds: string[];
			removeTagIds: string[];
			completed: boolean;
			notDoing: boolean;
			inProgress: boolean;
			toTest: boolean;
		}>
	) =>
		request<{ todos: Todo[] }>('PATCH', `/api/projects/${projectId}/todos/bulk`, { ids, patch }).then(
			(r) => r.todos
		),

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
