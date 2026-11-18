import { json, error } from '@sveltejs/kit';
import { requireMember } from '#lib/server/guard';
import { createSavedView, listSavedViews } from '#lib/server/todos';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	const member = await requireMember(locals, params.projectId);
	const views = await listSavedViews(params.projectId, member.userId);
	return json({ views });
};

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const member = await requireMember(locals, params.projectId);
	const body = await request.json().catch(() => null);
	const name = String(body?.name ?? '').trim();
	if (!name) throw error(400, 'View name required');
	if (!body?.config || typeof body.config !== 'object') throw error(400, 'View config required');

	const view = await createSavedView(
		params.projectId,
		member.userId,
		name,
		JSON.stringify(body.config),
		!!body.global
	);
	if (view === 'duplicate') throw error(409, 'A view with that name already exists');
	return json({ view }, { status: 201 });
};
