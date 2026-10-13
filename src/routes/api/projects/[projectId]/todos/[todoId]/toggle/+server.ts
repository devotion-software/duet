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

	await toggleTodo(params.todoId, completed);
	const todo = (await listTodos(params.projectId)).find((t) => t.id === params.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});
	return json({ todo });
};
