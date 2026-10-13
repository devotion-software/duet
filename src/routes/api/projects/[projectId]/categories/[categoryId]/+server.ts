import { json } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { deleteCategory } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	await deleteCategory(params.projectId, params.categoryId);
	publish(params.projectId, {
		type: 'category.changed',
		payload: { action: 'deleted', id: params.categoryId }
	});
	return json({ ok: true });
};
