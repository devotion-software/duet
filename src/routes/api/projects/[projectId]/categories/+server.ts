import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createCategory } from '#lib/server/todos';
import { publish } from '#lib/server/realtime';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	await requireMember(locals, params.projectId, { edit: true });
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	if (!name) throw error(400, 'Category name required');
	const color = String(body?.color ?? '#64748b');

	const category = await createCategory(params.projectId, name, color);
	publish(params.projectId, { type: 'category.changed', payload: { action: 'created', category } });
	return json({ category }, { status: 201 });
};
