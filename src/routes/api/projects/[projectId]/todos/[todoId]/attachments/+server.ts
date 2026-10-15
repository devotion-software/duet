import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { addAttachment, listTodos, todoBelongsToProject } from '#lib/server/todos';
import { putObject } from '#lib/server/storage';
import { publish } from '#lib/server/realtime';
import { newId } from '#lib/server/ids';
import type { RequestHandler } from './$types';

const ALLOWED = new Set([
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'application/pdf',
	'text/plain',
	'text/csv',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'application/vnd.ms-powerpoint',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'application/zip'
]);
const EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif',
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'text/csv': 'csv',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/zip': 'zip'
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const { userId } = await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');

	const mime = file.type;
	if (!ALLOWED.has(mime)) throw error(415, 'This file type is not supported');

	const maxMb = Number(process.env.UPLOAD_MAX_MB ?? 10);
	if (file.size > maxMb * 1024 * 1024) throw error(413, `Files must be under ${maxMb}MB`);

	const id = newId();
	const safeName =
		(file.name || 'file')
			.replace(/[^a-zA-Z0-9._-]/g, '_')
			.replace(/_+/g, '_')
			.slice(0, 80) || `file.${EXT[mime]}`;
	const key = `attachments/${params.projectId}/${params.todoId}/${id}-${safeName}`;

	const bytes = new Uint8Array(await file.arrayBuffer());
	await putObject(key, bytes, mime);

	const att = await addAttachment(params.todoId, {
		id,
		key,
		name: file.name || safeName,
		mime,
		size: file.size
	}, userId);
	const url = `/api/projects/${params.projectId}/attachments/${id}/raw`;

	// Broadcast the updated todo so other sessions pick up the new image.
	const todo = (await listTodos(params.projectId)).find((t) => t.id === params.todoId);
	publish(params.projectId, {
		type: 'todo.updated',
		origin: request.headers.get('x-client-id') ?? undefined,
		payload: todo
	});

	return json({ attachment: { id: att.id, name: att.name, mime: att.mime, size: att.size, url } }, { status: 201 });
};
