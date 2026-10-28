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

export type TaskStatus = 'open' | 'in_progress' | 'to_test' | 'done' | 'not_doing';

export function statusOf(t: Pick<Todo, 'completed' | 'notDoing' | 'startedAt' | 'testingAt'>): TaskStatus {
	if (t.completed) return t.notDoing ? 'not_doing' : 'done';
	if (t.testingAt) return 'to_test';
	return t.startedAt ? 'in_progress' : 'open';
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

	createTask: (projectId: string, input: { title: string; description?: string; parentId?: string | null }) =>
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
		}>
	) => request<{ todo: Todo }>('PATCH', `/api/projects/${projectId}/todos/${todoId}`, patch).then((r) => r.todo),

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
