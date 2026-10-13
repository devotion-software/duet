import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createTodo, listTodos, validateRefs } from '#lib/server/todos';
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

	const id = await createTodo(params.projectId, userId, {
		title,
		description: body.description ?? null,
		deadline: asDate(body.deadline),
		urgency: asEnum<Urgency>(body.urgency, URGENCIES),
		size: asEnum<Size>(body.size, SIZES),
		...refs
	});

	// Return the hydrated todo so the client can render it immediately.
	const todo = (await listTodos(params.projectId)).find((t) => t.id === id);
	publish(params.projectId, {
		type: 'todo.created',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});
	return json({ todo }, { status: 201 });
};
