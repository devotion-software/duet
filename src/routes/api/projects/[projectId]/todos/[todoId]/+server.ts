import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import {
	updateTodo,
	deleteTodo,
	listTodos,
	todoBelongsToProject,
	validateParent,
	validateRefs,
	ParentError
} from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import { URGENCIES, SIZES, type Urgency, type Size } from '#lib/server/db/app.schema';
import type { RequestHandler } from './$types';

function asEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
	return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function asDate(v: unknown): Date | null {
	if (!v) return null;
	const d = new Date(v as string);
	return isNaN(d.getTime()) ? null : d;
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	const body = await request.json().catch(() => null);
	if (!body) throw error(400, 'Invalid body');

	// Only validate refs for keys that were actually provided.
	const refs = await validateRefs(params.projectId, {
		categoryId: body.categoryId ?? null,
		assigneeId: body.assigneeId ?? null,
		tagIds: Array.isArray(body.tagIds) ? body.tagIds : []
	});

	let parentId: string | null = null;
	if ('parentId' in body) {
		try {
			parentId = await validateParent(params.projectId, params.todoId, body.parentId);
		} catch (e) {
			if (e instanceof ParentError) throw error(400, e.message);
			throw e;
		}
	}

	const affected = await updateTodo(params.projectId, params.todoId, {
		...('parentId' in body ? { parentId } : {}),
		...('title' in body ? { title: String(body.title) } : {}),
		...('description' in body ? { description: body.description ?? null } : {}),
		...('categoryId' in body ? { categoryId: refs.categoryId } : {}),
		...('assigneeId' in body ? { assigneeId: refs.assigneeId } : {}),
		...('deadline' in body ? { deadline: asDate(body.deadline) } : {}),
		...('urgency' in body ? { urgency: asEnum<Urgency>(body.urgency, URGENCIES) } : {}),
		...('size' in body ? { size: asEnum<Size>(body.size, SIZES) } : {}),
		...('tagIds' in body ? { tagIds: refs.tagIds } : {})
	});

	const all = await listTodos(params.projectId);
	const todo = all.find((t) => t.id === params.todoId);
	// Re-parenting an open task under a done one reopens the new ancestors.
	const reopened = new Set(affected);
	const todos = all.filter((t) => reopened.has(t.id));
	publish(params.projectId, {
		type: 'todos.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: [todo, ...todos].filter(Boolean)
	});
	return json({ todo, todos });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	// Subtasks go with their parent.
	const ids = await deleteTodo(params.projectId, params.todoId);
	publish(params.projectId, {
		type: 'todos.deleted',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: { ids }
	});
	return json({ ids });
};
