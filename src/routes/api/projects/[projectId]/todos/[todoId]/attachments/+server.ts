import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { addAttachment, listTodos, todoBelongsToProject } from '#lib/server/todos';
import { putObject } from '#lib/server/storage';
import { publish } from '#lib/server/realtime';
import { newId } from '#lib/server/ids';
import type { RequestHandler } from './$types';

const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/avif': 'avif'
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	if (!(await todoBelongsToProject(params.todoId, params.projectId)))
		throw error(404, 'Todo not found');

	const form = await request.formData();
	const file = form.get('file');
	if (!(file instanceof File)) throw error(400, 'No file provided');

	const mime = file.type;
	if (!ALLOWED.has(mime)) throw error(415, 'Only PNG, JPEG, GIF, WebP or AVIF images are allowed');

	const maxMb = Number(process.env.UPLOAD_MAX_MB ?? 10);
	if (file.size > maxMb * 1024 * 1024) throw error(413, `Images must be under ${maxMb}MB`);

	const id = newId();
	const safeName =
		(file.name || 'image')
			.replace(/[^a-zA-Z0-9._-]/g, '_')
			.replace(/_+/g, '_')
			.slice(0, 80) || `image.${EXT[mime]}`;
	const key = `attachments/${params.projectId}/${params.todoId}/${id}-${safeName}`;

	const bytes = new Uint8Array(await file.arrayBuffer());
	await putObject(key, bytes, mime);

	const att = await addAttachment(params.todoId, {
		id,
		key,
		name: file.name || safeName,
		mime,
		size: file.size
	});
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
