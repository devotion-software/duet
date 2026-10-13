import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { bulkUpdateTodos, bulkDeleteTodos, listTodos, validateRefs } from '#lib/server/todos';
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
function asIds(v: unknown): string[] {
	return Array.isArray(v) ? v.map(String) : [];
}

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });

	const body = await request.json().catch(() => null);
	const ids = asIds(body?.ids);
	const patch = body?.patch;
	if (!ids.length) throw error(400, 'ids array required');
	if (!patch || typeof patch !== 'object') throw error(400, 'patch required');

	const addTagIds = asIds(patch.addTagIds);
	const removeTagIds = asIds(patch.removeTagIds);
	const refs = await validateRefs(params.projectId, {
		categoryId: patch.categoryId ?? null,
		assigneeId: patch.assigneeId ?? null,
		tagIds: [...addTagIds, ...removeTagIds]
	});
	// Unlike single edits, a bad ref here would wipe the field across every
	// selected task, so reject instead of silently clearing.
	if (patch.categoryId && !refs.categoryId) throw error(400, 'Unknown category');
	if (patch.assigneeId && !refs.assigneeId) throw error(400, 'Assignee is not a member');
	const validTags = new Set(refs.tagIds);

	const updated = await bulkUpdateTodos(params.projectId, ids, {
		...('categoryId' in patch ? { categoryId: refs.categoryId } : {}),
		...('assigneeId' in patch ? { assigneeId: refs.assigneeId } : {}),
		...('deadline' in patch ? { deadline: asDate(patch.deadline) } : {}),
		...('urgency' in patch ? { urgency: asEnum<Urgency>(patch.urgency, URGENCIES) } : {}),
		...('size' in patch ? { size: asEnum<Size>(patch.size, SIZES) } : {}),
		...('completed' in patch ? { completed: !!patch.completed, notDoing: !!patch.notDoing } : {}),
		...('inProgress' in patch ? { inProgress: !!patch.inProgress } : {}),
		addTagIds: addTagIds.filter((id) => validTags.has(id)),
		removeTagIds: removeTagIds.filter((id) => validTags.has(id))
	});

	const touched = new Set(updated);
	const todos = (await listTodos(params.projectId)).filter((t) => touched.has(t.id));
	publish(params.projectId, {
		type: 'todos.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todos
	});
	return json({ todos });
};

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });

	const body = await request.json().catch(() => null);
	const ids = asIds(body?.ids);
	if (!ids.length) throw error(400, 'ids array required');

	const deleted = await bulkDeleteTodos(params.projectId, ids);
	publish(params.projectId, {
		type: 'todos.deleted',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: { ids: deleted }
	});
	return json({ ids: deleted });
};
