import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getLink, deleteLink, updateUrlLink, listTodos, normalizeUrl } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const link = await getLink(params.projectId, params.linkId);
	if (!link) throw error(404, 'Link not found');
	if (link.kind !== 'url') throw error(400, 'Only URL links can be edited');

	const body = await request.json();
	const url = normalizeUrl(String(body.url ?? ''));
	if (!url) throw error(400, 'Enter a valid URL');
	const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) || null : null;
	await updateUrlLink(link, { url, title }, userId);

	const todo = (await listTodos(params.projectId)).find((t) => t.id === link.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});

	return json({ link: { id: link.id, kind: 'url', url, title, linkedTodo: null } });
};

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
