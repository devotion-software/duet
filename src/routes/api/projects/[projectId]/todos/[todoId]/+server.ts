import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import {
	updateTodo,
	deleteTodo,
	listTodos,
	todoBelongsToProject,
	validateRefs
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

	await updateTodo(params.todoId, {
		...('title' in body ? { title: String(body.title) } : {}),
		...('description' in body ? { description: body.description ?? null } : {}),
		...('categoryId' in body ? { categoryId: refs.categoryId } : {}),
		...('assigneeId' in body ? { assigneeId: refs.assigneeId } : {}),
		...('deadline' in body ? { deadline: asDate(body.deadline) } : {}),
		...('urgency' in body ? { urgency: asEnum<Urgency>(body.urgency, URGENCIES) } : {}),
		...('size' in body ? { size: asEnum<Size>(body.size, SIZES) } : {}),
		...('tagIds' in body ? { tagIds: refs.tagIds } : {})
	});

	const todo = (await listTodos(params.projectId)).find((t) => t.id === params.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});
	return json({ todo });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	await deleteTodo(params.todoId);
	publish(params.projectId, {
		type: 'todo.deleted',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: { id: params.todoId }
	});
	return json({ ok: true });
};
