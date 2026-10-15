import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { updateTag, deleteTag } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import { sanitizeColor } from '#lib/color';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const patch: { name?: string; color?: string } = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) throw error(400, 'Tag name required');
		patch.name = name;
	}
	if (body?.color !== undefined) {
		const color = sanitizeColor(body.color);
		if (!color) throw error(400, 'Invalid colour');
		patch.color = color;
	}
	if (!Object.keys(patch).length) throw error(400, 'Nothing to update');

	const tag = await updateTag(params.projectId, params.tagId, patch);
	if (tag === 'duplicate') throw error(409, 'A tag with that name already exists');
	if (!tag) throw error(404, 'Tag not found');
	publish(params.projectId, { type: 'tag.changed', payload: { action: 'updated', tag } });
	return json({ tag });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	await deleteTag(params.projectId, params.tagId);
	publish(params.projectId, { type: 'tag.changed', payload: { action: 'deleted', id: params.tagId } });
	return json({ ok: true });
};
