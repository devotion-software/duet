import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { deleteTag } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	await deleteTag(params.projectId, params.tagId);
	publish(params.projectId, { type: 'tag.changed', payload: { action: 'deleted', id: params.tagId } });
	return json({ ok: true });
};
