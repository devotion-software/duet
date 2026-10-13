import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { reorderTodos } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const ids = Array.isArray(body?.ids) ? body.ids.map(String) : null;
	if (!ids) throw error(400, 'ids array required');

	await reorderTodos(params.projectId, ids);
	publish(params.projectId, {
		type: 'todos.reordered',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: { ids }
	});
	return json({ ok: true });
};
