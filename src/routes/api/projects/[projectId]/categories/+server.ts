import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createCategory, listCategories } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import { sanitizeColor } from '#lib/color';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	await requireMember(locals, params.projectId);
	const categories = await listCategories(params.projectId);
	return json({ categories });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	if (!name) throw error(400, 'Category name required');
	const color = sanitizeColor(body?.color) ?? '#64748b';

	const category = await createCategory(params.projectId, name, color);
	publish(params.projectId, { type: 'category.changed', payload: { action: 'created', category } });
	return json({ category }, { status: 201 });
};
