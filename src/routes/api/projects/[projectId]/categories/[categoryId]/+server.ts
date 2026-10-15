import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { updateCategory, deleteCategory } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import { sanitizeColor } from '#lib/color';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const patch: { name?: string; color?: string } = {};
	if (body?.name !== undefined) {
		const name = String(body.name).trim();
		if (!name) throw error(400, 'Category name required');
		patch.name = name;
	}
	if (body?.color !== undefined) {
		const color = sanitizeColor(body.color);
		if (!color) throw error(400, 'Invalid colour');
		patch.color = color;
	}
	if (!Object.keys(patch).length) throw error(400, 'Nothing to update');

	const category = await updateCategory(params.projectId, params.categoryId, patch);
	if (category === 'duplicate') throw error(409, 'A category with that name already exists');
	if (!category) throw error(404, 'Category not found');
	publish(params.projectId, {
		type: 'category.changed',
		payload: { action: 'updated', category }
	});
	return json({ category });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	await deleteCategory(params.projectId, params.categoryId);
	publish(params.projectId, {
		type: 'category.changed',
		payload: { action: 'deleted', id: params.categoryId }
	});
	return json({ ok: true });
};
