import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { todoBelongsToProject } from '#lib/server/todos';
import { listHistory } from '#lib/server/history';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId);
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');
	return json({ events: await listHistory(params.projectId, params.todoId) });
};
