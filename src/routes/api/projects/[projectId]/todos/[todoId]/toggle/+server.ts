import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { toggleTodo, listTodos, todoBelongsToProject } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	const body = await request.json().catch(() => null);
	const completed = !!body?.completed;

	// Completing cascades to subtasks; reopening cascades to ancestors.
	const touched = new Set(await toggleTodo(params.projectId, params.todoId, completed));
	const todos = (await listTodos(params.projectId)).filter((t) => touched.has(t.id));
	publish(params.projectId, {
		type: 'todos.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todos
	});
	return json({ todo: todos.find((t) => t.id === params.todoId), todos });
};
