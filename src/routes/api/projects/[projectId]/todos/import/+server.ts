import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { importTodos, listTodos } from '#lib/server/todos';
import { parseImport } from '#lib/parseImport';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const text = String(body?.text ?? '');
	const { items } = parseImport(text);
	if (!items.length) throw error(400, 'Nothing to import');

	const count = await importTodos(params.projectId, userId, items);
	const todos = await listTodos(params.projectId);
	publish(params.projectId, {
		type: 'todos.imported',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: { count }
	});
	return json({ count, todos });
};
