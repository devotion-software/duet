import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getLink, deleteLink, listTodos } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const link = await getLink(params.projectId, params.linkId);
	if (!link) throw error(404, 'Link not found');

	await deleteLink(link, userId);

	const todo = (await listTodos(params.projectId)).find((t) => t.id === link.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});

	return json({ ok: true });
};
