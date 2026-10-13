import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { listDeletedTodos } from '#lib/server/todos';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	return json({ todos: await listDeletedTodos(params.projectId) });
};
