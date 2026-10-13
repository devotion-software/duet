import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { listTodos, purgeTodo, restoreTodo } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

/** Restore a deleted task along with the subtasks deleted with it. */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const result = await restoreTodo(params.projectId, params.todoId, userId);
	if (!result) throw error(404, 'Deleted task not found');

	// The restored tasks, plus any ancestors reopened by restoring an open subtask.
	const changed = new Set([...result.restored, ...result.affected]);
	const todos = (await listTodos(params.projectId)).filter((t) => changed.has(t.id));
	publish(params.projectId, {
		type: 'todos.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todos
	});
	return json({ todos });
};

/** Permanently delete a deleted task and its subtasks. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { manage: true });
	const ids = await purgeTodo(params.projectId, params.todoId);
	if (!ids) throw error(404, 'Deleted task not found');
	return json({ ids });
};
