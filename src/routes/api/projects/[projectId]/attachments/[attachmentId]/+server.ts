import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { getAttachment, deleteAttachmentRow, listTodos } from '#lib/server/todos';
import { deleteObject } from '#lib/server/storage';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	const att = await getAttachment(params.projectId, params.attachmentId);
	if (!att) throw error(404, 'Attachment not found');

	await deleteObject(att.key);
	await deleteAttachmentRow(att, userId);

	const todo = (await listTodos(params.projectId)).find((t) => t.id === att.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});

	return json({ ok: true });
};
