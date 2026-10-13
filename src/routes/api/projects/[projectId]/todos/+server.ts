import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createTodo, listTodos, validateParent, validateRefs, ParentError } from '#lib/server/todos';
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

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const title = String(body?.title ?? '').trim();
	if (!title) throw error(400, 'A title is required');

	const refs = await validateRefs(params.projectId, {
		categoryId: body.categoryId ?? null,
		assigneeId: body.assigneeId ?? null,
		tagIds: Array.isArray(body.tagIds) ? body.tagIds : []
	});

	let parentId: string | null;
	try {
		parentId = await validateParent(params.projectId, null, body.parentId);
	} catch (e) {
		if (e instanceof ParentError) throw error(400, e.message);
		throw e;
	}

	const { id, affected } = await createTodo(params.projectId, userId, {
		title,
		parentId,
		description: body.description ?? null,
		deadline: asDate(body.deadline),
		urgency: asEnum<Urgency>(body.urgency, URGENCIES),
		size: asEnum<Size>(body.size, SIZES),
		...refs
	});

	// Return the hydrated todo so the client can render it immediately, plus any
	// ancestors that were reopened by adding an open subtask.
	const all = await listTodos(params.projectId);
	const todo = all.find((t) => t.id === id);
	const reopened = new Set(affected);
	const todos = all.filter((t) => reopened.has(t.id));
	const origin = request.headers.get('x-client-id') ?? undefined;
	publish(params.projectId, { type: 'todo.created', origin, payload: todo });
	if (todos.length) publish(params.projectId, { type: 'todos.updated', origin, payload: todos });
	return json({ todo, todos }, { status: 201 });
};
