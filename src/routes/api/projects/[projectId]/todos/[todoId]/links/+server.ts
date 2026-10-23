import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getMembership } from '#lib/server/projects';
import { addUrlLink, addTaskLink, listTodos, todoBelongsToProject, normalizeUrl } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	const body = await request.json();
	let link;
	if (body.kind === 'url') {
		const url = normalizeUrl(String(body.url ?? ''));
		if (!url) throw error(400, 'Enter a valid URL');
		const title = typeof body.title === 'string' ? body.title.trim().slice(0, 255) || null : null;
		link = await addUrlLink(params.todoId, { url, title }, userId);
	} else if (body.kind === 'task') {
		const linkedTodoId = String(body.linkedTodoId ?? '');
		const linkedProjectId = String(body.linkedProjectId ?? '');
		if (!linkedTodoId || !linkedProjectId) throw error(400, 'Pick a task to link');
		if (linkedTodoId === params.todoId) throw error(400, "A task can't link to itself");
		// Any role may be linked to — linking doesn't modify the target project.
		if (!(await getMembership(userId, linkedProjectId))) throw error(404, 'Project not found');
		if (!(await todoBelongsToProject(linkedTodoId, linkedProjectId)))
			throw error(404, 'Task not found');
		link = await addTaskLink(params.todoId, linkedTodoId, userId);
		if (!link) throw error(404, 'Task not found');
	} else {
		throw error(400, 'Unknown link kind');
	}

	const todo = (await listTodos(params.projectId)).find((t) => t.id === params.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});

	return json({ link }, { status: 201 });
};
